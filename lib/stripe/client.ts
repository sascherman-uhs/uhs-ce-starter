/**
 * Stripe client — STUBBED in this starter (makes NO live Stripe calls).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * This open-source wireframe ships WITHOUT a live Stripe integration. The
 * registration / coupon / refund / webhook code paths are wired up structurally,
 * but every Stripe SDK method used by the app is replaced here with an explicit
 * mock that returns canned data and DOES NOT reach Stripe. Each mock logs a
 * clear message so it's obvious in dev that payments are not wired.
 *
 * TODO: customize for your own payment processor.
 * To wire real Stripe:
 *   1. npm install stripe   (already in package.json)
 *   2. Replace the body of this file with:
 *
 *        import Stripe from 'stripe'
 *        if (!process.env.STRIPE_SECRET_KEY) {
 *          throw new Error('STRIPE_SECRET_KEY is not set. See .env.example.')
 *        }
 *        export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
 *
 *   3. Add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to your .env (see .env.example)
 *   4. Register a webhook endpoint pointing at /api/webhooks/stripe and set
 *      STRIPE_WEBHOOK_SECRET to its signing secret.
 *
 * See README.md → "Wiring payments (Stripe)" for the full walkthrough.
 * ───────────────────────────────────────────────────────────────────────────
 */

function stubLog(method: string): void {
  console.log(
    `[STUB stripe.${method}] no-op — Stripe is not wired in this starter. ` +
      `See lib/stripe/client.ts and README.md → "Wiring payments (Stripe)".`
  )
}

// A mock Stripe client. Only the surface the app actually uses is implemented.
// Shapes mirror the real SDK closely enough for the wireframe to run end-to-end.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe: any = {
  checkout: {
    sessions: {
      // TODO: customize for your own payment processor — create a real Checkout
      // Session (or your processor's equivalent) and return its hosted URL.
      async create(_params?: unknown): Promise<any> {
        stubLog("checkout.sessions.create")
        return {
          id: "cs_stub_checkout_session",
          url: "/form/register?stub=checkout-not-wired",
          payment_status: "unpaid",
          amount_total: 0,
          metadata: {},
        }
      },
      // Used by webhook fulfillment to re-read a session. Returns a paid-looking
      // stub so the fulfillment path can be exercised without Stripe.
      async retrieve(id?: string, _opts?: unknown): Promise<any> {
        stubLog("checkout.sessions.retrieve")
        return {
          id: id ?? "cs_stub_checkout_session",
          payment_status: "unpaid", // unpaid → fulfillment is a safe no-op
          amount_total: 0,
          customer_details: null,
          customer_email: null,
          payment_intent: null,
          metadata: {},
        }
      },
    },
  },

  promotionCodes: {
    // TODO: customize for your own payment processor — look up the coupon code.
    // Returns an empty list (= "no such coupon") so the form treats any entered
    // code as invalid rather than silently granting a discount.
    async list(_params?: unknown): Promise<any> {
      stubLog("promotionCodes.list")
      return { data: [] }
    },
  },

  refunds: {
    // TODO: customize for your own payment processor — issue a real refund.
    async create(_params?: unknown, _opts?: unknown): Promise<any> {
      stubLog("refunds.create")
      return { id: "re_stub_refund", status: "succeeded", amount: 0 }
    },
  },

  webhooks: {
    // The webhook route never runs without STRIPE_WEBHOOK_SECRET set, but if it
    // is reached, fail loudly rather than fabricate a forged event.
    constructEvent(_body?: unknown, _sig?: unknown, _secret?: unknown): never {
      throw new Error(
        "Stripe webhooks are not wired in this starter. See lib/stripe/client.ts " +
          'and README.md → "Wiring payments (Stripe)".'
      )
    },
  },
}
