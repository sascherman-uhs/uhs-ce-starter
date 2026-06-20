"use server"

/**
 * Phase 8 Plan 06 (D-17, D-18, D-19): Admin-initiated refund Server Action.
 *
 * Complementary to the webhook reconciliation path (lib/stripe/fulfill.ts → reconcileRefund):
 *   - This action is the SYNCHRONOUS write side: admin clicks Refund → we hit Stripe → we
 *     write ce_refunds + bump ce_attendees.refunded_total_cents in one round trip.
 *   - The webhook is the BELT-AND-SUSPENDERS read side: charge.refunded fires later and
 *     no-ops via the UNIQUE(stripe_refund_id) constraint on ce_refunds.
 *
 * Idempotency: the second arg to stripe.refunds.create uses a DETERMINISTIC key
 *   `refund-${attendeeId}-${amount}-v1` so an accidental double-click within the
 *   same Server Action lifecycle is a Stripe-side no-op. NO `Date.now()` here.
 */

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe/client"

const RefundSchema = z.object({
  attendee_id: z.string().uuid(),
  // Optional partial-refund support (omitted ⇒ refund full remaining).
  amount_cents: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  reason: z.string().max(500).optional(),
})

export type RefundState = {
  error?: string
  success?: boolean
}

export async function refundAttendee(
  _prev: RefundState,
  formData: FormData
): Promise<RefundState> {
  // 1. Auth — admin only. Mirror createSession / removeAttendee pattern in app/admin/sessions/actions.ts.
  const ssr = await createClient()
  const {
    data: { user },
  } = await ssr.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  // 2. Validate input.
  const parsed = RefundSchema.safeParse({
    attendee_id: formData.get("attendee_id"),
    amount_cents: formData.get("amount_cents"),
    reason: (formData.get("reason") as string) || undefined,
  })
  if (!parsed.success) {
    return { error: "Invalid input" }
  }

  const admin = createAdminClient()

  // 3. Look up the attendee row.
  const { data: attendee } = await admin
    .from("ce_attendees")
    .select(
      "id, session_id, paid_amount_cents, refunded_total_cents, stripe_payment_intent_id"
    )
    .eq("id", parsed.data.attendee_id)
    .single()

  if (!attendee) {
    return { error: "Attendee not found" }
  }

  // 4. Defensive guard: free / comp registrations have no PaymentIntent.
  //    Verbatim copy from UI-SPEC §"Empty / error states".
  if (!attendee.stripe_payment_intent_id) {
    return { error: "This registration has no payment to refund." }
  }

  // 5. Compute amount: full remaining if not specified.
  const remaining =
    (attendee.paid_amount_cents || 0) - (attendee.refunded_total_cents || 0)
  const amount = parsed.data.amount_cents ?? remaining
  if (amount <= 0) {
    return { error: "Nothing to refund." }
  }
  if (amount > remaining) {
    return { error: "Refund exceeds remaining amount" }
  }

  // 6. Stripe call. Deterministic idempotencyKey makes accidental double-clicks safe.
  let refund
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: attendee.stripe_payment_intent_id,
        amount,
        // Stripe-recognized enum (their controlled vocabulary). Freeform reason
        // from the admin goes into our ce_refunds.reason column instead.
        reason: "requested_by_customer",
        metadata: {
          attendee_id: attendee.id,
          admin_user_id: user.id,
        },
      },
      {
        idempotencyKey: `refund-${attendee.id}-${amount}-v1`,
      }
    )
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Stripe rejected the refund."
    return { error: `Refund failed: ${message}` }
  }

  // 7. Insert audit row. UNIQUE(stripe_refund_id) makes the webhook a no-op on retry.
  const { error: insertErr } = await admin.from("ce_refunds").insert({
    attendee_id: attendee.id,
    session_id: attendee.session_id,
    stripe_refund_id: refund.id,
    stripe_payment_intent_id: attendee.stripe_payment_intent_id,
    amount_cents: amount,
    reason: parsed.data.reason || null,
    stripe_status: refund.status ?? "pending",
    created_by: user.id,
    raw_event: refund as unknown as Record<string, unknown>,
  })
  if (insertErr) {
    // Stripe call already succeeded — surface as a partial-failure to the admin.
    console.error(
      "ce_refunds insert failed after Stripe refund created:",
      insertErr
    )
    return {
      error:
        "Refund issued at Stripe, but the audit log failed. Please copy the refund ID from Stripe Dashboard and contact support.",
    }
  }

  // 8. Update denormalized refunded_total_cents on the attendee.
  await admin
    .from("ce_attendees")
    .update({
      refunded_total_cents: (attendee.refunded_total_cents || 0) + amount,
    })
    .eq("id", attendee.id)

  revalidatePath(`/admin/sessions/${attendee.session_id}`)
  return { success: true }
}
