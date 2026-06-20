"use client"

import { useFormState, useFormStatus } from "react-dom"
import { registerForSession, type RegisterState } from "../actions"
import { CouponField, type AttachedCouponPreview } from "./coupon-field"
import { PriceSummary } from "./price-summary"

function RegisterSubmitButton({ isPaidPath }: { isPaidPath: boolean }) {
  const { pending } = useFormStatus()
  const ctaLabel = isPaidPath ? "Continue to payment" : "Register"
  const pendingLabel = isPaidPath ? "Redirecting…" : "Registering…"
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? pendingLabel : ctaLabel}
    </button>
  )
}

export function RegisterForm({
  sessionId,
  resolvedFeeCents,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  attachedCouponCode,
  attachedCouponPreview,
}: {
  sessionId: string
  resolvedFeeCents: number
  attachedCouponCode: string | null
  attachedCouponPreview: AttachedCouponPreview
}) {
  const [state, formAction] = useFormState<RegisterState, FormData>(
    registerForSession,
    {}
  )

  // Determine UI state per UI-SPEC §"Page-Level Interaction Contracts" state table.
  const isFreeClass = resolvedFeeCents === 0
  const isCompPath =
    !!attachedCouponPreview?.isComp && !attachedCouponPreview.error
  const showCouponField = !isFreeClass // any paid class shows it
  const showPriceSummary = !isFreeClass && !isCompPath

  // CTA reads "Register" when the path is free OR comp-resolved; else "Continue to payment".
  const isPaidPath = !isFreeClass && !isCompPath

  // Compute the effective subtotal/discount for the price summary.
  const effectiveDiscountCents =
    attachedCouponPreview && !attachedCouponPreview.error
      ? attachedCouponPreview.discountCents
      : 0

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="session_id" value={sessionId} />

      {state.error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* First Name */}
      <div className="space-y-1.5">
        <label htmlFor="first_name" className="text-sm font-medium">
          First Name
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          autoComplete="given-name"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-base"
        />
        {state.fieldErrors?.first_name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.first_name[0]}
          </p>
        )}
      </div>

      {/* Last Name */}
      <div className="space-y-1.5">
        <label htmlFor="last_name" className="text-sm font-medium">
          Last Name
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          required
          autoComplete="family-name"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-base"
        />
        {state.fieldErrors?.last_name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.last_name[0]}
          </p>
        )}
      </div>

      {/* License Number */}
      <div className="space-y-1.5">
        <label htmlFor="license_number" className="text-sm font-medium">
          License Number
        </label>
        <input
          id="license_number"
          name="license_number"
          type="text"
          required
          placeholder="S.1234567"
          autoCapitalize="characters"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-base font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Prefix + number, no leading zeros. Valid prefixes: S (Salesperson),
          BS (Broker Salesperson), B (Broker), PM (Property Manager),
          PB (Property Mgr Broker). Example: S.1234567
        </p>
        {state.fieldErrors?.license_number && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.license_number[0]}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-base"
        />
        {state.fieldErrors?.email && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Phone (optional) */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-base"
        />
      </div>

      {/* Attestation */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="attestation"
            required
            className="mt-1 h-5 w-5 rounded border-input"
          />
          <span className="text-sm leading-snug">
            I will attend the full 3-hour session. I understand that I must be
            present for the entire class to receive CE credit.
          </span>
        </label>
        {state.fieldErrors?.attestation && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.attestation[0]}
          </p>
        )}
      </div>

      {/* Phase 8 — Coupon field (only if paid class) */}
      {showCouponField && (
        <CouponField
          attachedCouponPreview={attachedCouponPreview}
          formError={state.fieldErrors?.coupon_code?.[0]}
        />
      )}

      {/* Phase 8 — Price summary (only if paid AND not comp-resolved) */}
      {showPriceSummary && (
        <PriceSummary
          subtotalCents={resolvedFeeCents}
          discountCents={effectiveDiscountCents}
        />
      )}

      {/* Phase 8 — Stripe redirect helper line, only on paid path */}
      {isPaidPath && (
        <p className="text-xs text-muted-foreground text-center">
          You&apos;ll be redirected to Stripe to complete payment securely.
        </p>
      )}

      {/* Submit */}
      <RegisterSubmitButton isPaidPath={isPaidPath} />
    </form>
  )
}
