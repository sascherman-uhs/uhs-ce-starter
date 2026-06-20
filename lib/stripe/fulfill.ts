// metadata.ce_session_id (not session_id) — avoids collision with Stripe Checkout Session id per RESEARCH.md naming recommendation. D-06 originally said "session_id".
import type Stripe from 'stripe'
import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRegistrationConfirmation } from '@/lib/cascade/email'

/**
 * Webhook fulfillment for `checkout.session.completed`.
 *
 * Idempotent at the DB layer via the partial UNIQUE index on
 * ce_attendees.stripe_checkout_session_id (Plan 01 migration). On duplicate
 * delivery, the insert returns Postgres error code 23505 and we treat it as
 * a no-op success.
 *
 * Per CONTEXT D-05/D-06: this is the source of truth for paid-registration
 * row creation. Per CONTEXT D-14: also fires sendRegistrationConfirmation
 * (the Stripe receipt email is sent by Stripe automatically — no code here).
 *
 * Per RESEARCH.md "## Pitfalls & Gotchas":
 *   - Re-retrieve the session to confirm payment_status === 'paid'.
 *   - Use customer_details?.email ?? customer_email for the email field.
 */
export async function fulfillCheckout(
  sessionParam: Stripe.Checkout.Session
): Promise<void> {
  const fresh = await stripe.checkout.sessions.retrieve(sessionParam.id, {
    expand: ['payment_intent'],
  })
  if (fresh.payment_status !== 'paid') {
    // unfinished / async / failed — do not create a row; Stripe will retry the webhook
    // if it transitions to 'paid' later (or another event will fire).
    return
  }

  const meta = fresh.metadata ?? {}
  const ceSessionId = meta.ce_session_id
  if (!ceSessionId) {
    throw new Error(
      'fulfillCheckout: missing ce_session_id in Stripe metadata; cannot insert ce_attendees row'
    )
  }

  const admin = createAdminClient()
  const email = fresh.customer_details?.email ?? fresh.customer_email ?? null
  if (!email) {
    throw new Error('fulfillCheckout: no email available on Checkout Session')
  }

  const paymentIntentId =
    typeof fresh.payment_intent === 'string'
      ? fresh.payment_intent
      : fresh.payment_intent?.id ?? null

  // Idempotent insert — UNIQUE on stripe_checkout_session_id catches duplicates.
  const { error: insertErr } = await admin.from('ce_attendees').insert({
    session_id: ceSessionId,
    first_name: meta.first_name ?? '',
    last_name: meta.last_name ?? '',
    license_number: meta.license_number ?? '',
    email,
    phone: meta.phone || null,
    status: 'registered',
    paid_amount_cents: fresh.amount_total ?? 0,
    coupon_code: meta.coupon_code_input || null,
    stripe_checkout_session_id: fresh.id,
    stripe_payment_intent_id: paymentIntentId,
  })

  if (insertErr) {
    // 23505 = unique_violation → already inserted by an earlier delivery; treat as success.
    if ((insertErr as any).code === '23505') {
      return
    }
    throw insertErr
  }

  // Mirror the existing free-path: increment registered_count via RPC, with manual fallback.
  // Pattern verified from app/form/register/actions.ts lines 130-153.
  try {
    await admin.rpc('increment_registered_count', { p_session_id: ceSessionId })
  } catch {
    try {
      const { data: cur } = await admin
        .from('ce_sessions')
        .select('registered_count')
        .eq('id', ceSessionId)
        .single()
      if (cur) {
        await admin
          .from('ce_sessions')
          .update({ registered_count: (cur.registered_count || 0) + 1 })
          .eq('id', ceSessionId)
      }
    } catch (countErr) {
      console.error('fulfillCheckout: registered_count increment fallback failed:', countErr)
    }
  }

  // Send our Resend confirmation. Stripe sends its own auto-receipt to customer_email.
  const { data: ceSession } = await admin
    .from('ce_sessions')
    .select(
      'session_date, start_time, end_time, location_name, location_address, ce_courses(title)'
    )
    .eq('id', ceSessionId)
    .single()

  if (ceSession) {
    const courseTitle = (ceSession.ce_courses as any)?.title || 'CE Class'
    try {
      await sendRegistrationConfirmation({
        sessionId: ceSessionId,
        attendeeEmail: email,
        attendeeName: `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim(),
        courseTitle,
        sessionDate: ceSession.session_date,
        startTime: ceSession.start_time,
        endTime: ceSession.end_time,
        locationName: ceSession.location_name,
        locationAddress: ceSession.location_address,
      })
    } catch (emailErr) {
      // Per RESEARCH.md "## Webhook→email failure handling": do NOT roll back insert,
      // do NOT return 5xx (Stripe should not retry just because Resend was down).
      console.error('fulfillCheckout: confirmation email failed:', emailErr)
    }
  }
}

/**
 * Webhook reconciliation for `charge.refunded` (CONTEXT D-21).
 *
 * Belt-and-suspenders: the synchronous admin Refund action (Plan 06) writes
 * ce_refunds directly. This handler covers the case where someone refunds via
 * Stripe Dashboard. UNIQUE on stripe_refund_id makes duplicate inserts a no-op.
 */
export async function reconcileRefund(charge: Stripe.Charge): Promise<void> {
  const admin = createAdminClient()
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : null

  for (const refund of charge.refunds?.data ?? []) {
    // Look up the attendee by payment_intent_id so we can fill attendee_id/session_id.
    let attendeeId: string | null = null
    let attendeeSessionId: string | null = null
    if (paymentIntentId) {
      const { data: attendee } = await admin
        .from('ce_attendees')
        .select('id, session_id, refunded_total_cents')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()
      if (attendee) {
        attendeeId = attendee.id
        attendeeSessionId = attendee.session_id
      }
    }

    const { error } = await admin.from('ce_refunds').insert({
      attendee_id: attendeeId,
      session_id: attendeeSessionId,
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId ?? '',
      amount_cents: refund.amount,
      reason: null,
      stripe_status: refund.status ?? 'unknown',
      raw_event: refund as any,
    })

    if (error) {
      if ((error as any).code === '23505') {
        // Already audited (synchronous admin path inserted it). No-op.
        continue
      }
      console.error('reconcileRefund: insert failed:', error)
      continue
    }

    // If we just inserted a Dashboard-originated refund, bump the denormalized total.
    if (attendeeId) {
      const { data: cur } = await admin
        .from('ce_attendees')
        .select('refunded_total_cents')
        .eq('id', attendeeId)
        .single()
      if (cur) {
        await admin
          .from('ce_attendees')
          .update({ refunded_total_cents: (cur.refunded_total_cents || 0) + refund.amount })
          .eq('id', attendeeId)
      }
    }
  }
}
