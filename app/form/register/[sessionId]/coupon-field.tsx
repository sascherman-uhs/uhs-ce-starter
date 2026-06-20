"use client"

import { useState } from "react"
import { formatCents, MINUS_SIGN } from "@/lib/money"

export type AttachedCouponPreview = {
  code: string
  discountCents: number
  finalCents: number
  isComp: boolean
  error?: string
} | null

/**
 * Per UI-SPEC §"Component Inventory" + §"Public registration form".
 *
 * Renders one of these states:
 *   1. Idle empty — no attached code, no user input. Just the input.
 *   2. Pre-applied (attachedCouponPreview is set, no error, !isComp) — chip with code + discount, Remove link.
 *   3. Pre-applied comp (attachedCouponPreview is set, isComp = true) — purple "Comp coupon" chip.
 *   4. Error (attachedCouponPreview.error set OR formError prop set) — destructive copy below input.
 *
 * Submitting the main form posts the current input value as `coupon_code`.
 * Per UI-SPEC §"Mobile-First & Progressive Enhancement Rules" rule 1: no JS required.
 */
export function CouponField({
  attachedCouponPreview,
  formError,
}: {
  attachedCouponPreview: AttachedCouponPreview
  formError?: string
}) {
  const initialCode = attachedCouponPreview?.code ?? ""
  const [removed, setRemoved] = useState(false)

  // If a comp coupon was attached and validated, show the purple chip and a hidden input.
  if (
    attachedCouponPreview?.isComp &&
    !attachedCouponPreview.error &&
    !removed
  ) {
    return (
      <div className="space-y-1.5">
        <input
          type="hidden"
          name="coupon_code"
          value={attachedCouponPreview.code}
        />
        <div className="inline-flex rounded-md bg-purple-100 px-3 py-2 text-xs font-medium text-purple-700">
          Comp coupon — no payment required
        </div>
      </div>
    )
  }

  const showAppliedChip =
    attachedCouponPreview &&
    !attachedCouponPreview.error &&
    !attachedCouponPreview.isComp &&
    !removed

  if (showAppliedChip && attachedCouponPreview) {
    return (
      <div className="space-y-1.5">
        <input
          type="hidden"
          name="coupon_code"
          value={attachedCouponPreview.code}
        />
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-md bg-blue-100 px-3 py-2 text-xs font-medium text-blue-700">
            Coupon {attachedCouponPreview.code} applied: {MINUS_SIGN}
            {formatCents(attachedCouponPreview.discountCents)}
          </span>
          <button
            type="button"
            onClick={() => setRemoved(true)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Remove coupon
          </button>
        </div>
      </div>
    )
  }

  // Editable input state (idle, removed, or pre-applied with error).
  return (
    <div className="space-y-1.5">
      <label htmlFor="coupon_code" className="text-sm font-medium">
        Coupon code
      </label>
      <input
        id="coupon_code"
        name="coupon_code"
        type="text"
        defaultValue={removed ? "" : initialCode}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        placeholder="EARLYBIRD"
        className="w-full rounded-md border border-input bg-background px-4 py-3 text-base uppercase"
      />
      <p className="text-xs text-muted-foreground">
        {attachedCouponPreview
          ? "Code applied from your invitation. You can change it."
          : "Have a code? Enter it here."}
      </p>
      {(attachedCouponPreview?.error || formError) && (
        <p className="text-sm text-destructive">
          {attachedCouponPreview?.error || formError}
        </p>
      )}
    </div>
  )
}
