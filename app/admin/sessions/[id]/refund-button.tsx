"use client"

// Inline 2-step confirm matches RemoveAttendeeButton pattern per UI-SPEC §"Destructive Actions"
// (overrides D-17 "modal" wording — UI-SPEC is canonical; see Plan 08-06 <context_delta>).
//
// The action is reversible at Stripe (admin can issue a counter-charge if mistaken)
// and is permanently logged in ce_refunds, so a modal would create needless visual
// inconsistency with the project's existing destructive-action pattern.

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { refundAttendee, type RefundState } from "./refund-actions"
import { formatCents } from "@/lib/money"

function RefundSubmit({ amount }: { amount: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Refunding…" : `Issue ${formatCents(amount)} refund`}
    </button>
  )
}

/**
 * Per UI-SPEC §"Component Inventory / RefundButton" + §"Destructive actions":
 * Mirrors RemoveAttendeeButton's 2-step inline confirm (NO modal).
 *
 * Visibility (enforced by parent — see attendee-list.tsx):
 *   - Visible when stripe_payment_intent_id IS NOT NULL AND refunded_total_cents < paid_amount_cents
 *   - When fully refunded, parent renders the "Refunded $X.XX on M/D" badge instead.
 *   - When the attendee never paid (free/comp), parent does NOT render this component at all.
 */
export function RefundButton({
  attendeeId,
  remainingCents,
}: {
  attendeeId: string
  remainingCents: number
}) {
  const [state, formAction] = useFormState<RefundState, FormData>(
    refundAttendee,
    {}
  )
  const [confirming, setConfirming] = useState(false)

  if (state.success) {
    return <span className="text-xs text-green-700 font-medium">Refunded</span>
  }

  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs font-medium hover:bg-red-50"
        >
          Refund
        </button>
        {state.error && (
          <span className="text-xs text-destructive">{state.error}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <form action={formAction}>
        <input type="hidden" name="attendee_id" value={attendeeId} />
        {/* amount_cents omitted ⇒ Server Action refunds the full remaining amount */}
        <RefundSubmit amount={remainingCents} />
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded border border-input px-2 py-1 text-xs font-medium hover:bg-accent"
      >
        Cancel
      </button>
      {state.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </div>
  )
}
