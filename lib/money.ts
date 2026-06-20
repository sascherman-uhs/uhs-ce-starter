/**
 * Canonical money helpers for Phase 8 (cents-as-integer per CONTEXT D-02).
 *
 * USD only (per CONTEXT D-03) — no Intl.NumberFormat locale switching.
 * Display format: '$XX.XX' with leading '$' and exactly two decimals, no thousands separator.
 *
 * Used everywhere money is shown:
 *   - app/form/register/[sessionId]/price-summary.tsx
 *   - app/form/register/[sessionId]/coupon-field.tsx
 *   - app/admin/sessions/[id]/attendee-list.tsx (Paid / Refunded badges)
 *   - app/admin/sessions/[id]/refund-button.tsx (confirm copy)
 *   - app/admin/sessions/new/session-form.tsx (Pricing field helper)
 */

/** Unicode minus sign (U+2212). Use this — NOT the ASCII hyphen — for discount lines per UI-SPEC. */
export const MINUS_SIGN = '−' as const

/** Integer cents → '$XX.XX' (always two decimals, USD only, no locale). */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return '$0.00'
  const whole = Math.trunc(cents / 100)
  const frac = Math.abs(cents % 100).toString().padStart(2, '0')
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${Math.abs(whole)}.${frac}`
}

/** Dollars-with-decimals string (e.g. '25.00', '$25.99') → integer cents. Tolerates a leading '$' and empty input. */
export function dollarsToCents(input: string): number {
  if (!input) return 0
  const cleaned = String(input).replace(/[$,\s]/g, '')
  if (cleaned === '') return 0
  const parsed = parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}
