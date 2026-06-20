# Stripe Integration — Operations Runbook

> Phase 8 added paid registration via Stripe Checkout, coupon support, and admin refunds.
> This runbook covers local development, Vercel environment setup, Stripe Dashboard webhook registration, and the smoke-test matrix.

## Architecture (one-line)

Pay-then-register: form submit → Server Action creates Stripe Checkout Session → user pays on stripe.com → webhook (`POST /api/webhooks/stripe`) writes the `ce_attendees` row + sends our Resend confirmation. Free path (`fee_cents == 0` OR coupon → $0) skips Stripe entirely.

### Webhook-as-source-of-truth

The Stripe webhook (`/api/webhooks/stripe`) is the **only writer** of paid `ce_attendees` rows. The Server Action that initiates Checkout never inserts; the success page never inserts; only `fulfillCheckout()` inside the webhook handler inserts. This is a deliberate D-05 decision so that the financial event (payment captured by Stripe) and the registration record creation happen atomically against a single signed source of truth.

Two layers of idempotency protect against double-delivery:
1. `stripe_events.event_id` UNIQUE — duplicate event id → 200 immediately, no work
2. `ce_attendees.stripe_checkout_session_id` UNIQUE — defense-in-depth if event id is somehow new but the session was already fulfilled

### Free-path bypass

A single check `discountedFeeCents <= 0` covers three cases:
- Base `fee_cents == 0` (truly free session)
- 100%-comp coupon brings price to zero
- Fixed-amount coupon `>= fee_cents` brings price to zero

When the bypass triggers, **Stripe is never touched** (no Checkout Session created, no API call). The Server Action inserts `ce_attendees` directly and fires the existing Resend confirmation email. This is required because Stripe rejects Checkout Sessions below the USD $0.50 minimum.

### Cents-as-integer convention

All monetary values are stored as `integer` columns named `*_cents` (`fee_cents`, `paid_amount_cents`, `refunded_total_cents`, `amount_cents`). Floats are NEVER used for money. Display formatting happens at the boundary via `formatCents(n)` from `lib/money.ts` (returns `"$25.00"` for `2500`).

### No-code decisions covered by this runbook

- **D-13:** Per-recipient unique codes deferred. Stripe Dashboard supports them natively if needed in v2; no integration code changes required for MVP — `resolveCoupon` already handles arbitrary code strings.
- **D-16:** Stripe auto-receipts use default Stripe branding/template. No code changes required for MVP. (Configure Stripe Dashboard → Settings → Branding if custom logo/colors are wanted later.)
- **D-20 delta:** D-20 originally listed `STRIPE_PUBLISHABLE_KEY` as a required env var. Hosted Stripe Checkout (D-04) does not use the client-side Stripe SDK, so `STRIPE_PUBLISHABLE_KEY` is intentionally NOT included. If Payment Element is ever adopted in v2, add it then.

## Environment Variables

| Variable | Where used | Local dev | Vercel Preview | Vercel Production |
|----------|------------|-----------|-----------------|--------------------|
| `STRIPE_SECRET_KEY` | server-only — webhook + Server Actions | `sk_test_...` (Test mode) | `sk_test_...` (Test mode) | `sk_live_...` (Live mode) |
| `STRIPE_WEBHOOK_SECRET` | server-only — webhook signature verification | `whsec_...` from `stripe listen` | `whsec_...` from Stripe Dashboard "Test" webhook endpoint | `whsec_...` from Stripe Dashboard "Live" webhook endpoint |
| `NEXT_PUBLIC_APP_URL` | server — used to build `success_url` / `cancel_url` | `http://localhost:3001` | Vercel Preview URL | Production URL |

`@stripe/stripe-js` (publishable key) is **NOT** installed. Hosted Stripe Checkout doesn't need it (D-20 delta above).

Stripe account: `acct_...` (your account; start in Test mode).

## Local Development

```bash
# 1. Install Stripe CLI (one-time, via Homebrew)
brew install stripe/stripe-cli/stripe

# 2. Auth (one-time; CLI session lasts 90 days — expires ~2026-07-31 per project memory)
stripe login

# 3. Forward Stripe events to the dev server
stripe listen \
  --forward-to localhost:3001/api/webhooks/stripe \
  --events checkout.session.completed,charge.refunded
```

The CLI prints `Ready! Your webhook signing secret is 'whsec_xxx'` — **paste this into `.env.local` as `STRIPE_WEBHOOK_SECRET`**. This secret is different from the one Stripe Dashboard generates for the deployed endpoints. Each environment has its own.

To trigger synthetic events without a full checkout flow:
```bash
stripe trigger checkout.session.completed   # tests fulfillCheckout idempotency
stripe trigger charge.refunded              # tests reconcileRefund
```

## Vercel Environment Setup

### One-time: register webhook endpoints in Stripe Dashboard

1. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
2. Create one endpoint per environment that needs the webhook:
   - **Preview/Staging**: URL `https://<vercel-preview-url>/api/webhooks/stripe`, events `checkout.session.completed` + `charge.refunded`. Copy the generated `whsec_...` and store it in Vercel as `STRIPE_WEBHOOK_SECRET` for the Preview environment.
   - **Production**: URL `https://<production-domain>/api/webhooks/stripe`, same two events. Toggle Stripe to **Live mode** before creating this endpoint. Store its `whsec_...` in Vercel as `STRIPE_WEBHOOK_SECRET` for Production.

### One-time: copy keys to Vercel

```bash
# Preview (Test mode keys)
vercel env add STRIPE_SECRET_KEY preview        # paste sk_test_...
vercel env add STRIPE_WEBHOOK_SECRET preview    # paste whsec_... from Test webhook endpoint
vercel env add NEXT_PUBLIC_APP_URL preview      # paste the Vercel Preview deployment URL

# Production (Live mode keys)
vercel env add STRIPE_SECRET_KEY production     # paste sk_live_...
vercel env add STRIPE_WEBHOOK_SECRET production # paste whsec_... from Live webhook endpoint
vercel env add NEXT_PUBLIC_APP_URL production   # paste the production domain
```

After setting env vars, redeploy: `vercel --prod` (or `vercel` for Preview).

> **Critical:** if `NEXT_PUBLIC_APP_URL` is missing in Vercel, the registration Server Action returns `{ error: "Server misconfigured (missing NEXT_PUBLIC_APP_URL)." }` and ALL paid registrations fail. Confirm with `vercel env ls preview` before testing.

### One-time: enable Stripe receipt emails in Test mode

In Live mode receipts auto-send. **In Test mode they're OFF by default.**

Stripe Dashboard → Settings → Emails → Customer emails → **toggle on** "Successful payments". Without this, paid-flow tests in Test mode won't produce receipts even though the code path is correct.

## Smoke Test Matrix

Run these against `http://localhost:3001` with `stripe listen` forwarding. Each scenario should pass before considering Phase 8 deliverable.

### Test cards

| Scenario | Card | Notes |
|----------|------|-------|
| Generic success | `4242 4242 4242 4242` | Any future date, any CVC, any ZIP |
| Generic decline | `4000 0000 0000 0002` | |
| 3D Secure | `4000 0027 6000 3184` | Forces auth challenge |

(Full list: https://docs.stripe.com/testing#cards)

### Scenarios

1. **Free session, no coupon** — register; Stripe is NOT touched; `ce_attendees` row appears immediately; Resend confirmation lands.
2. **Free session, comp coupon** — coupon validation runs (one Stripe API call); free-path bypass inserts the row; only Resend email sent.
3. **Paid session, no coupon, success (4242)** — submit → redirect to Stripe Checkout → enter test card → land on `/success?cs=...` → "Confirming…" briefly → page refreshes to "You're registered!" once webhook lands.
4. **Paid session, percent-off coupon** — coupon chip renders; price summary shows discount; `paid_amount_cents` reflects discounted total.
5. **Paid session, fixed-amount coupon** — same as #4.
6. **Paid session, 100%-comp coupon** — purple chip renders; CTA reads "Register"; submit goes straight to free-path bypass; NO Stripe Checkout Session created (verify in Stripe Dashboard → Logs).
7. **Paid session, declined card (4000…0002)** — Stripe Checkout shows error; clicking "← Back" lands on `/cancelled`; no row created.
8. **Webhook double-delivery** — `stripe trigger checkout.session.completed` twice; `stripe_events` has 2 rows by id, `ce_attendees` only 1 (UNIQUE constraint).
9. **Slow webhook** — kill `stripe listen` mid-checkout; complete payment in Checkout; verify success page shows "Confirming…" with meta-refresh; restart `stripe listen`; page refreshes to success.
10. **Refund full** — admin Refund button → confirm → `ce_refunds` row created; badge becomes "Refunded $X.XX on M/D"; Stripe sends customer refund email.
11. **Refund attempted on free attendee** — Server Action returns "This registration has no payment to refund." (button is hidden via visibility rule, but test the defensive guard by hitting the action directly).
12. **Refund initiated in Stripe Dashboard** — issue refund from Stripe Dashboard → `charge.refunded` webhook fires → `ce_refunds` row appears via reconciliation path.
13. **Stuck-paid recovery** — manually skip the webhook; verify `/api/payments/status?cs=cs_test_...` returns `{ ready: false }`; verify after 20s the success page shows the stuck-helper copy.

### Phase gate

- All 13 scenarios pass against `http://localhost:3001`
- `npm run lint` is green
- Vercel Preview deployment has correct env vars + webhook endpoint registered
- One full paid checkout works against the deployed Preview URL using Test mode keys

## Refund Operations

Refunds can originate two ways; both paths converge on the same `ce_refunds` audit row via UNIQUE constraint deduplication:

- **From the admin UI** (`/admin/sessions/[id]` → attendee row → Refund button): synchronous server action calls `stripe.refunds.create` with a deterministic idempotency key (`refund-${attendeeId}-${amount}-v1`), then inserts the `ce_refunds` row and bumps `ce_attendees.refunded_total_cents`. The `charge.refunded` webhook arrives later and is a UNIQUE-constraint no-op.
- **From the Stripe Dashboard** (Payments → Refund): only the `charge.refunded` webhook fires; `reconcileRefund()` inserts the audit row + bumps the denormalized total. The admin UI surfaces the refund on the next page load.

Partial refunds: support multiple refund records per attendee. The "Refunded" badge only displays when `refunded_total_cents >= paid_amount_cents` (full refund); partial refunds keep the "Paid $X.XX" badge.

## Pitfalls Recap (read RESEARCH.md "## Pitfalls" for full list)

- App Router uses `await req.text()` for raw body — NO `bodyParser` config needed.
- Stripe USD minimum is $0.50 — 100%-off coupons MUST go through the free-path bypass.
- Webhook fires AFTER the user is redirected — success page only READS, never writes.
- `discounts: [...]` and `allow_promotion_codes: true` are mutually exclusive on a Checkout Session — we use `discounts`.
- Stripe receipts in Test mode are OFF by default — toggle on in Dashboard.
- Webhook signing secret is per-environment — three different `STRIPE_WEBHOOK_SECRET` values across dev / Preview / Production.

## Failure modes (quick reference)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `500` from `/api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` not set | Set the env var; redeploy |
| `400` from `/api/webhooks/stripe`, "signature mismatch" | Wrong `whsec_*` for this environment (e.g., dev secret used on Preview) | Re-copy from the matching Stripe Dashboard endpoint |
| Paid registration: success page stuck on "Confirming…" past 20s | Webhook not delivered or 5xx'd | Stripe Dashboard → Webhooks → Recent deliveries; replay the event |
| `{ error: "Server misconfigured (missing NEXT_PUBLIC_APP_URL)." }` on submit | `NEXT_PUBLIC_APP_URL` missing on the deployed env | `vercel env add NEXT_PUBLIC_APP_URL <env>` and redeploy |
| Two `ce_attendees` rows for one payment | Should not happen — UNIQUE on `stripe_checkout_session_id` prevents it | Investigate; likely a manual SQL insert |

## Recovery procedures

- **Stuck "paid but no row"**: SQL: `select * from stripe_events where processed_at is null` → if any rows exist, manually re-invoke `fulfillCheckout(payload->'data'->'object')` from a one-off `npx tsx` script. (No automated reconciliation script ships in v1; build one if this becomes routine.)
- **Refund logged at Stripe but our audit row failed**: copy the `re_xxx` ID from Stripe Dashboard, INSERT a `ce_refunds` row manually with that id, and bump `ce_attendees.refunded_total_cents`.
- **Webhook secret rotated**: update `STRIPE_WEBHOOK_SECRET` in the matching Vercel environment, redeploy. Old in-flight events will fail signature verification — Stripe retries for up to 3 days, so a redeploy within that window catches them.
