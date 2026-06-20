"use client"

import { useFormState, useFormStatus } from "react-dom"
import { updateSessionPricing, type UpdatePricingState } from "../actions"
import { formatCents } from "@/lib/money"

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save Pricing"}
    </button>
  )
}

/** Cents → bare dollars string for the text input (e.g. 1000 → "10.00"), via the
 *  canonical formatter (no toFixed in the money path). Empty when fee is unset. */
function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  return formatCents(cents).replace(/^\$/, "")
}

export function PricingSection({
  session,
  sessionId,
  courseFeeCents,
}: {
  session: { fee_cents: number | null; attached_coupon_code: string | null }
  sessionId: string
  courseFeeCents: number
}) {
  const [state, formAction] = useFormState<UpdatePricingState, FormData>(
    updateSessionPricing.bind(null, sessionId),
    {}
  )

  // Effective price the public registration form will use right now:
  // session override if set, else the linked course's default.
  const effectiveCents = session.fee_cents ?? courseFeeCents
  const effectiveLabel = effectiveCents > 0 ? formatCents(effectiveCents) : "Free"

  return (
    <div className="rounded-md border p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pricing</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Current price for this class:{" "}
            <span className="font-medium text-foreground">{effectiveLabel}</span>
            {session.fee_cents === null && (
              <> (inherited from course default)</>
            )}
          </p>
        </div>
        <span
          className={
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
            (effectiveCents > 0
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600")
          }
        >
          {effectiveCents > 0 ? "Paid" : "Free"}
        </span>
      </div>

      <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="fee_dollars" className="text-sm font-medium">
            Session fee
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground"
              aria-hidden="true"
            >
              $
            </span>
            <input
              id="fee_dollars"
              name="fee_dollars"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              placeholder="0.00"
              defaultValue={centsToInput(session.fee_cents)}
              className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave blank to use the course default ({formatCents(courseFeeCents)}).
            Enter $0 for a free class.
          </p>
          {state.fieldErrors?.fee_dollars && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.fee_dollars[0]}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="attached_coupon_code" className="text-sm font-medium">
            Pre-applied coupon code
          </label>
          <input
            id="attached_coupon_code"
            name="attached_coupon_code"
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="EARLYBIRD"
            defaultValue={session.attached_coupon_code ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Auto-filled on this session&apos;s registration link. Manage
            codes in the Stripe Dashboard.
          </p>
          {state.fieldErrors?.attached_coupon_code && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.attached_coupon_code[0]}
            </p>
          )}
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <SaveButton />
          {state.success && (
            <span className="text-xs text-green-600">Saved ✓</span>
          )}
          {state.error && (
            <span className="text-xs text-destructive">{state.error}</span>
          )}
        </div>
      </form>
    </div>
  )
}
