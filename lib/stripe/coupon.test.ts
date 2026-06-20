/**
 * Tests for resolveCoupon (Plan 08-02).
 *
 * Run via:
 *   STRIPE_SECRET_KEY=sk_test_dummy_for_test npx tsx --test lib/stripe/coupon.test.ts
 *
 * The dummy STRIPE_SECRET_KEY is required because lib/stripe/client.ts throws
 * on missing env at module-load time. The tests then monkey-patch the loaded
 * singleton's promotionCodes property to inject behavior — no real Stripe
 * API calls are made.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'

type FakePromo = {
  id: string
  expires_at: number | null
  max_redemptions: number | null
  times_redeemed: number
  coupon: { percent_off?: number | null; amount_off?: number | null }
}

type FakeStripePromotionCodes = {
  list: (args: {
    code: string
    active: boolean
    limit: number
  }) => Promise<{ data: FakePromo[] }>
}

function buildFakePromotionCodes(promo: FakePromo | null): FakeStripePromotionCodes {
  return {
    list: async () => ({ data: promo ? [promo] : [] }),
  }
}

async function withFake(
  promo: FakePromo | null,
  fn: (resolveCoupon: typeof import('./coupon').resolveCoupon) => Promise<void>
): Promise<void> {
  const clientMod: any = await import('./client')
  const stripe = clientMod.stripe
  const original = stripe.promotionCodes
  stripe.promotionCodes = buildFakePromotionCodes(promo)
  try {
    const { resolveCoupon } = await import('./coupon')
    await fn(resolveCoupon)
  } finally {
    stripe.promotionCodes = original
  }
}

test('no code returns fee unchanged', async () => {
  await withFake(null, async (resolveCoupon) => {
    const r = await resolveCoupon(undefined, 5000)
    assert.equal(r.discountedFeeCents, 5000)
    assert.equal(r.error, undefined)
    assert.equal(r.promotionCodeId, undefined)
  })
})

test('empty string returns fee unchanged', async () => {
  await withFake(null, async (resolveCoupon) => {
    const r = await resolveCoupon('', 5000)
    assert.equal(r.discountedFeeCents, 5000)
    assert.equal(r.error, undefined)
  })
})

test('whitespace-only string returns fee unchanged', async () => {
  await withFake(null, async (resolveCoupon) => {
    const r = await resolveCoupon('   ', 5000)
    assert.equal(r.discountedFeeCents, 5000)
    assert.equal(r.error, undefined)
  })
})

test('invalid code returns ERR_INVALID', async () => {
  await withFake(null, async (resolveCoupon) => {
    const r = await resolveCoupon('NOPE', 5000)
    assert.equal(r.discountedFeeCents, 5000)
    assert.equal(
      r.error,
      "That coupon isn't valid. Check the code and try again."
    )
  })
})

test('expired coupon returns ERR_EXPIRED', async () => {
  const expired: FakePromo = {
    id: 'promo_x',
    expires_at: Math.floor(Date.now() / 1000) - 10,
    max_redemptions: null,
    times_redeemed: 0,
    coupon: { percent_off: 20, amount_off: null },
  }
  await withFake(expired, async (resolveCoupon) => {
    const r = await resolveCoupon('OLD', 5000)
    assert.equal(r.error, 'This coupon has expired.')
    assert.equal(r.discountedFeeCents, 5000)
  })
})

test('used-up coupon returns ERR_REDEEMED', async () => {
  const usedUp: FakePromo = {
    id: 'promo_x',
    expires_at: null,
    max_redemptions: 5,
    times_redeemed: 5,
    coupon: { percent_off: 20, amount_off: null },
  }
  await withFake(usedUp, async (resolveCoupon) => {
    const r = await resolveCoupon('USED', 5000)
    assert.equal(r.error, 'This coupon is no longer available.')
    assert.equal(r.discountedFeeCents, 5000)
  })
})

test('percent_off 20 on $50 yields $40', async () => {
  const p: FakePromo = {
    id: 'promo_pct',
    expires_at: null,
    max_redemptions: null,
    times_redeemed: 0,
    coupon: { percent_off: 20, amount_off: null },
  }
  await withFake(p, async (resolveCoupon) => {
    const r = await resolveCoupon('PCT20', 5000)
    assert.equal(r.promotionCodeId, 'promo_pct')
    assert.equal(r.discountedFeeCents, 4000)
    assert.equal(r.error, undefined)
  })
})

test('amount_off 1500 on $50 yields $35', async () => {
  const p: FakePromo = {
    id: 'promo_amt',
    expires_at: null,
    max_redemptions: null,
    times_redeemed: 0,
    coupon: { percent_off: null, amount_off: 1500 },
  }
  await withFake(p, async (resolveCoupon) => {
    const r = await resolveCoupon('AMT15', 5000)
    assert.equal(r.promotionCodeId, 'promo_amt')
    assert.equal(r.discountedFeeCents, 3500)
  })
})

test('100%-comp resolves to 0', async () => {
  const p: FakePromo = {
    id: 'promo_comp',
    expires_at: null,
    max_redemptions: null,
    times_redeemed: 0,
    coupon: { percent_off: 100, amount_off: null },
  }
  await withFake(p, async (resolveCoupon) => {
    const r = await resolveCoupon('COMP', 5000)
    assert.equal(r.promotionCodeId, 'promo_comp')
    assert.equal(r.discountedFeeCents, 0)
  })
})

test('amount_off larger than fee clamps to 0', async () => {
  const p: FakePromo = {
    id: 'promo_big',
    expires_at: null,
    max_redemptions: null,
    times_redeemed: 0,
    coupon: { percent_off: null, amount_off: 10000 },
  }
  await withFake(p, async (resolveCoupon) => {
    const r = await resolveCoupon('OVER', 5000)
    assert.equal(r.discountedFeeCents, 0)
  })
})
