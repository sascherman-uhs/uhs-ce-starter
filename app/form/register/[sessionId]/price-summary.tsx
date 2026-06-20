import { formatCents, MINUS_SIGN } from "@/lib/money"

/**
 * Per UI-SPEC §"Component Inventory" + §"Money Display Rules".
 * Three-row layout: Subtotal, Discount (only if > 0), Total. Total is the focal point.
 *
 * Server Component (no client interactivity needed).
 */
export function PriceSummary({
  subtotalCents,
  discountCents,
}: {
  subtotalCents: number
  discountCents: number
}) {
  const totalCents = Math.max(0, subtotalCents - discountCents)
  return (
    <div className="rounded-md bg-muted p-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{formatCents(subtotalCents)}</span>
      </div>
      {discountCents > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Discount</span>
          <span className="font-medium text-green-700">
            {MINUS_SIGN}
            {formatCents(discountCents)}
          </span>
        </div>
      )}
      <div className="border-t border-input pt-2 flex justify-between items-baseline">
        <span className="text-sm font-medium">Total</span>
        <span className="text-2xl font-semibold">{formatCents(totalCents)}</span>
      </div>
    </div>
  )
}
