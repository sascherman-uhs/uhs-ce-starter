import { stripe } from './client'

/**
 * Result shape from resolveCoupon. Matches what registerForSession expects to branch on.
 *
 * - error set ⇒ render UI-SPEC error copy in the form, do NOT proceed.
 * - discountedFeeCents === 0 ⇒ free-path bypass (per CONTEXT D-08).
 * - discountedFeeCents > 0 + promotionCodeId ⇒ paid path; pass promotionCodeId to
 *   stripe.checkout.sessions.create as discounts: [{ promotion_code: promotionCodeId }].
 */
export type ResolvedCoupon = {
  promotionCodeId?: string
  discountedFeeCents: number
  error?: string
}

// Public-facing error copy. Must match UI-SPEC §"Public registration form"
// coupon error copy verbatim — these strings are rendered directly to the
// attendee. Plan 08-04 reads them from this module.
const ERR_INVALID = "That coupon isn't valid. Check the code and try again."
const ERR_EXPIRED = 'This coupon has expired.'
const ERR_REDEEMED = 'This coupon is no longer available.'

/**
 * Validate a coupon code against Stripe and compute the resolved (post-discount) fee.
 *
 * Per CONTEXT D-09, D-10, D-12: lookup is read-only against stripe.promotionCodes.list,
 * supports percent_off / amount_off / 100%-comp natively. No local coupon table.
 * Per UI-SPEC: error strings here must match the public coupon error copy verbatim.
 */
export async function resolveCoupon(
  code: string | undefined | null,
  feeCents: number
): Promise<ResolvedCoupon> {
  if (!code || !code.trim()) {
    return { discountedFeeCents: feeCents }
  }

  const list = await stripe.promotionCodes.list({
    code: code.trim(),
    active: true,
    limit: 1,
    expand: ['data.promotion.coupon'],
  })
  const promo = list.data[0]
  if (!promo) {
    return { discountedFeeCents: feeCents, error: ERR_INVALID }
  }
  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
    return { discountedFeeCents: feeCents, error: ERR_EXPIRED }
  }
  if (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions) {
    return { discountedFeeCents: feeCents, error: ERR_REDEEMED }
  }

  // Stripe SDK v22+: coupon nests under promotion.coupon (was promo.coupon pre-v22).
  // Tests still use the legacy shape via the FakePromo mock — fall back to it.
  const promoAny = promo as unknown as {
    promotion?: { coupon?: unknown }
    coupon?: unknown
  }
  const couponRaw = promoAny.promotion?.coupon ?? promoAny.coupon
  if (!couponRaw || typeof couponRaw !== 'object') {
    return { discountedFeeCents: feeCents, error: ERR_INVALID }
  }
  const coupon = couponRaw as { percent_off?: number | null; amount_off?: number | null }
  let discounted = feeCents
  if (coupon.percent_off) {
    discounted = Math.round(feeCents * (1 - coupon.percent_off / 100))
  } else if (coupon.amount_off) {
    discounted = Math.max(0, feeCents - coupon.amount_off)
  }
  if (discounted < 0) discounted = 0

  return {
    promotionCodeId: promo.id,
    discountedFeeCents: discounted,
  }
}
