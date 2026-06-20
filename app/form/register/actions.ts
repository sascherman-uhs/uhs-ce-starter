"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { z } from "zod"
import { sendRegistrationConfirmation } from "@/lib/cascade/email"
import { stripe } from "@/lib/stripe/client"
import { resolveCoupon } from "@/lib/stripe/coupon"
import {
  normalizeLicenseNumber,
  LICENSE_NUMBER_REGEX,
  LICENSE_NUMBER_ERROR,
} from "@/lib/registration/license"
import crypto from "node:crypto"

const RegistrationSchema = z.object({
  session_id: z.string().uuid("Invalid session"),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  license_number: z
    .string()
    .min(1, "License number is required")
    .regex(LICENSE_NUMBER_REGEX, LICENSE_NUMBER_ERROR),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  attestation: z.literal("on", {
    errorMap: () => ({ message: "You must agree to attend the full session" }),
  }),
  // Phase 8 (D-09, D-11): optional Stripe promotion code (uppercase, alphanumeric + dash/underscore)
  coupon_code: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Z0-9_-]*$/i, "Invalid coupon code format")
    .optional()
    .or(z.literal("")),
})

export type RegisterState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function registerForSession(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const raw = {
    session_id: formData.get("session_id") as string,
    first_name: (formData.get("first_name") as string)?.trim(),
    last_name: (formData.get("last_name") as string)?.trim(),
    license_number: normalizeLicenseNumber(
      (formData.get("license_number") as string) || ""
    ),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    attestation: formData.get("attestation") as string,
    coupon_code:
      ((formData.get("coupon_code") as string) || "").trim().toUpperCase() ||
      undefined,
  }

  const result = RegistrationSchema.safeParse(raw)
  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    }
  }

  const data = result.data
  const admin = createAdminClient()

  // Verify session exists, is scheduled, and is in the future
  const { data: session, error: sessionError } = await admin
    .from("ce_sessions")
    .select(
      "id, session_date, start_time, end_time, location_name, location_address, status, fee_cents, attached_coupon_code, course_id, ce_courses(title, fee_cents)"
    )
    .eq("id", data.session_id)
    .single()

  if (sessionError || !session) {
    return { error: "Session not found." }
  }

  if (session.status === "draft" || session.status === "cancelled") {
    return { error: "This session is not accepting registrations." }
  }

  const sessionDate = new Date(session.session_date + "T23:59:59")
  if (sessionDate < new Date()) {
    return { error: "Registration for this session has closed." }
  }

  // ────────────────────────────────────────────────────────────────────
  // Phase 8: Resolve effective fee + coupon, branch to paid or free path.
  // ────────────────────────────────────────────────────────────────────

  // D-01: session.fee_cents IF NOT NULL ELSE course.fee_cents
  const courseRow = Array.isArray(session.ce_courses)
    ? session.ce_courses[0]
    : (session.ce_courses as { title?: string; fee_cents?: number } | null)
  const courseFeeCents: number = courseRow?.fee_cents ?? 0
  const resolvedFeeCents: number =
    session.fee_cents !== null && session.fee_cents !== undefined
      ? session.fee_cents
      : courseFeeCents

  // D-09 + D-11: form coupon takes precedence over the session's attached coupon.
  const effectiveCouponCode: string | undefined =
    data.coupon_code || session.attached_coupon_code || undefined

  // Resolve coupon against Stripe (no-op when no code).
  let resolved: {
    promotionCodeId?: string
    discountedFeeCents: number
    error?: string
  }
  try {
    resolved = await resolveCoupon(effectiveCouponCode, resolvedFeeCents)
  } catch (couponErr) {
    console.error("Coupon validation network error:", couponErr)
    return {
      fieldErrors: {
        coupon_code: [
          "We couldn't verify that code right now. Please try again.",
        ],
      },
    }
  }
  if (resolved.error) {
    return { fieldErrors: { coupon_code: [resolved.error] } }
  }

  // ────────────────────────────────────────────────────────────────────
  // FREE-PATH BYPASS (D-08): fee=0 OR coupon resolved to 0.
  // Skip Stripe entirely. Use the existing free-path insert + email below.
  // ────────────────────────────────────────────────────────────────────
  if (resolved.discountedFeeCents > 0) {
    // ──────────────────────────────────────────────────────────────────
    // PAID PATH (D-04, D-06): create Stripe Checkout Session, redirect.
    // Webhook (Plan 08-02 fulfillCheckout) is the SOLE writer of
    // ce_attendees on this path — do NOT insert here.
    // ──────────────────────────────────────────────────────────────────
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL
    if (!APP_URL) {
      return { error: "Server misconfigured (missing NEXT_PUBLIC_APP_URL)." }
    }

    const courseTitle = courseRow?.title || "CE Class"

    let checkoutSession
    try {
      checkoutSession = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: data.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: resolvedFeeCents, // PRE-discount; Stripe applies the promo
                product_data: {
                  name: courseTitle,
                  description: `${session.session_date} • ${session.location_name}`,
                },
              },
            },
          ],
          discounts: resolved.promotionCodeId
            ? [{ promotion_code: resolved.promotionCodeId }]
            : undefined,
          metadata: {
            ce_session_id: data.session_id,
            first_name: data.first_name,
            last_name: data.last_name,
            license_number: data.license_number,
            phone: data.phone || "",
            attestation_at: new Date().toISOString(),
            coupon_code_input: effectiveCouponCode || "",
          },
          payment_intent_data: {
            metadata: {
              ce_session_id: data.session_id,
              license_number: data.license_number,
            },
          },
          success_url: `${APP_URL}/form/register/${data.session_id}/success?cs={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/form/register/${data.session_id}/cancelled`,
        },
        { idempotencyKey: crypto.randomUUID() }
      )
    } catch (stripeErr) {
      const se = stripeErr as Record<string, unknown>
      console.error("STRIPE_ERR_TYPE:", String(se?.type ?? "unknown"))
      console.error("STRIPE_ERR_CODE:", String(se?.code ?? "none"))
      console.error("STRIPE_ERR_STATUS:", String(se?.statusCode ?? "none"))
      console.error(
        "STRIPE_ERR_MSG:",
        stripeErr instanceof Error ? stripeErr.message.slice(0, 300) : JSON.stringify(stripeErr).slice(0, 300)
      )
      return {
        error:
          "Something went wrong starting checkout. Please try again. If the problem persists, email hello@example.com.",
      }
    }

    if (!checkoutSession.url) {
      return { error: "Stripe did not return a checkout URL. Please try again." }
    }

    // Redirect to hosted Stripe Checkout. ce_attendees row is written by the
    // webhook handler on checkout.session.completed (D-05).
    redirect(checkoutSession.url)
  }

  // ────────────────────────────────────────────────────────────────────
  // FREE PATH (continues): insert ce_attendees directly + send Resend email.
  // ────────────────────────────────────────────────────────────────────

  // Insert attendee
  const { error: insertError } = await admin.from("ce_attendees").insert({
    session_id: data.session_id,
    first_name: data.first_name,
    last_name: data.last_name,
    license_number: data.license_number,
    email: data.email,
    phone: data.phone || null,
    status: "registered",
    // Phase 8 (free-path tagging):
    paid_amount_cents: 0,
    coupon_code: effectiveCouponCode || null,
    // stripe_checkout_session_id and stripe_payment_intent_id stay NULL on free path.
  })

  if (insertError) {
    // Handle duplicate (unique constraint on session_id + license_number)
    if (
      insertError.code === "23505" ||
      insertError.message?.includes("duplicate") ||
      insertError.message?.includes("unique")
    ) {
      return { error: "You're already registered for this class." }
    }
    console.error("Registration insert failed:", insertError)
    return { error: "Registration failed. Please try again." }
  }

  // Increment registered_count (non-blocking error handling)
  try {
    await admin.rpc("increment_registered_count", {
      p_session_id: data.session_id,
    })
  } catch {
    // Fallback: manual increment
    try {
      const { data: currentSession } = await admin
        .from("ce_sessions")
        .select("registered_count")
        .eq("id", data.session_id)
        .single()
      if (currentSession) {
        await admin
          .from("ce_sessions")
          .update({
            registered_count: (currentSession.registered_count || 0) + 1,
          })
          .eq("id", data.session_id)
      }
    } catch (countErr) {
      console.error("Failed to increment registered_count:", countErr)
    }
  }

  // Send confirmation email (non-blocking)
  const courseTitle = courseRow?.title || "CE Class"
  try {
    await sendRegistrationConfirmation({
      sessionId: data.session_id,
      attendeeEmail: data.email,
      attendeeName: `${data.first_name} ${data.last_name}`,
      courseTitle,
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      locationName: session.location_name,
      locationAddress: session.location_address,
    })
  } catch (emailErr) {
    console.error("Confirmation email failed:", emailErr)
    // Don't fail registration — email is best-effort
  }

  redirect(`/form/register/${data.session_id}/success`)
}
