# CE Classes Admin — Starter

An open-source **starter / wireframe** for running real-estate **Continuing
Education (CE) classes**: schedule sessions, take registrations, check attendees
in, collect NRED-style evaluations, issue certificates, and prepare regulatory
filings. Built with **Next.js (App Router) + Supabase**.

> **This is a wireframe.** Payments (Stripe) and all outbound integrations
> (email, calendar, flyer generation, marketing sync) are **stubbed out** — the
> code paths exist and compile, but the external calls are replaced with clearly
> commented stubs. You bring your own keys and wire up the providers you want.
> See **[Wiring integrations](#wiring-integrations)** below.

It started life as the internal admin app for a home-staging company's
Nevada CE course and was generalized so any stager (or CE provider) can clone it.
All client data, credentials, and company-specific branding have been removed.

> **For AI coding agents:** this repo is meant to be downloaded and customized
> for a *specific* school. Before writing features, do a pass over the
> [Customization checklist](#customization-checklist-for-ai-agents) below and
> resolve every `// TODO: customize for your school/state` marker in the code
> (find them with `grep -rn "TODO: customize for your" .`). The defaults are
> deliberately generic placeholders, **not** working values — especially the
> course numbers, certificate branding, and state filing forms/addresses, which
> are a Nevada example and will be wrong for any other jurisdiction.

---

## What's inside

- **Admin dashboard** (`/admin`) — create sessions, view rosters, manage
  check-ins and no-shows, trigger filings, see a per-session "cascade" status.
- **Public forms** (`/form/...`) — registration (with optional coupon/payment),
  check-in, and post-class evaluation, each with success pages.
- **Roster** (`/roster/[sessionId]`) — shareable attendee roster + printable view.
- **Certificates** — server-side PDF generation via `@react-pdf/renderer`.
- **Filings** — helpers to build NRED-style Form 785a (roster), 612C (evaluation
  summary), and Form 901 (course notice). *These default to Nevada formats and
  the Nevada Real Estate Division's public email addresses as a worked example —
  replace them with your own state's requirements before going live.*
- **Supabase schema** — `supabase/migrations/` (schema only, no data).

## Tech stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS ·
Supabase (Postgres + Auth + Storage) · `@react-pdf/renderer` · `qrcode`.

---

## Quick start

### 1. Prerequisites
- Node.js 18–20
- A free [Supabase](https://supabase.com) project

### 2. Install
```bash
npm install
```

### 3. Create your database
Run the SQL in `supabase/migrations/` against your Supabase project, in
filename order. Either:
- paste each file into the Supabase **SQL Editor**, or
- use the [Supabase CLI](https://supabase.com/docs/guides/local-development):
  ```bash
  supabase link --project-ref YOUR_PROJECT_REF
  supabase db push
  ```
The first migration (`00000000000000_base_schema.sql`) creates the core tables;
the dated ones add payment/eval columns. It's **schema only** — no seed data.

You'll also want two **Storage buckets** for generated artifacts:
`ce-assets` (QR codes) and one for certificates (see `lib/certificate/generate.ts`).

### 4. Configure environment
```bash
cp .env.example .env.local
```
Fill in your Supabase URL + keys (and `CE_PUBLIC_APP_URL`). See `.env.example`
for the full annotated list.

### 5. Create an admin user
In the Supabase dashboard → **Authentication → Users**, add a user. Either log
in at `/admin/login`, or set `DEV_USER_EMAIL` / `DEV_USER_PASSWORD` in
`.env.local` for dev auto-login.

### 6. Run
```bash
npm run dev
```
Open <http://localhost:3001>.

---

## Wiring integrations

Everything below is **stubbed** in this starter. Each stub logs what it *would*
do and points back here. Enable only what you need.

### Payments (Stripe)
`lib/stripe/client.ts` ships a **mock** Stripe client: every method the app uses
(`checkout.sessions.create`/`retrieve`, `promotionCodes.list`, `refunds.create`)
returns canned data and makes **no live call** to Stripe, so the registration /
coupon / refund / webhook flows run end-to-end in the wireframe without keys.
To enable real payments:
1. Restore the real client (the file documents the exact replacement):
   ```ts
   import Stripe from 'stripe'
   if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.')
   export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
   ```
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env.local`.
3. Register a webhook endpoint pointing at `/api/webhooks/stripe`
   (events: `checkout.session.completed`, `charge.refunded`) and use its signing
   secret as `STRIPE_WEBHOOK_SECRET`. For local dev:
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```
The registration, coupon, refund, and fulfillment code is already wired to this
client — it just needs a real Stripe behind it.

### Email
All email sending is **stubbed** — the functions log what they would send and
make no live call.
- **Transactional** (certificates, confirmations): `lib/cascade/email.ts` ships a
  mock `resend` object. Restore the real `Resend` client and set `RESEND_API_KEY`
  + a verified sending domain.
- **SMTP/IMAP** drafts live in `lib/email/gmail.ts` (stubbed). Restore the
  `nodemailer` + `imapflow` implementation or swap in your provider.
- **Outlook/Microsoft Graph** drafts live in `lib/email/outlook-draft.ts`
  (stubbed). This requires an Azure app registration — wire it with env vars, or
  just route these through the same provider as above.

### Flyers, calendar, marketing sync
`lib/cascade/canva.ts`, `lib/cascade/calendar.ts`, and the Flodesk helpers in
`lib/flodesk/` and `lib/noshow/` are **reference workflows**, not live calls.
In the original app a background worker performed these steps via external tools;
the app records *intent* in the database and a worker drains the queue. Wire your
own worker (cron job, queue consumer, etc.) or replace these with direct API
calls. `lib/flyer/generate.ts` already does flyer PDF generation in-process via
`@react-pdf/renderer` as an alternative to an external design tool.

---

## Customization checklist (for AI agents)

Work through these four areas. Every code anchor below also carries an inline
`// TODO: customize for your school/state` comment — run
`grep -rn "TODO: customize for your" .` to jump to each one.

### 1. Your school / organization identity
- Edit **`lib/config/branding.ts`** — company/school name, contact email + phone,
  signer name, and transactional "from" addresses. These strings render into
  emails, certificates, flyers, and filings.
- Replace **`public/brand/logo.png`** with your logo and update
  **`public/manifest.json`** (name, description, theme color).

### 2. Your approved course number(s)
- Course title, number, and credit hours are **data** — create them as rows in
  the **`ce_courses`** table (no real rows ship with this starter).
- The hardcoded fallback `"CE.0000000-RE"` in
  `app/form/eval/actions.ts`, `app/admin/sessions/actions.ts`, and
  `app/admin/sessions/filing-actions.ts` is a placeholder. Use **your** real,
  state-approved course number format.

### 3. Your certificate template / branding
- **`lib/certificate/generate.ts`** builds the PDF (layout, wording, fonts,
  colors) via `@react-pdf/renderer` — restyle it to your brand.
- **`lib/certificate/seal.ts`** ships a transparent placeholder seal. Embed your
  own seal as a base64 data URI (encoding instructions are in the file).
- Confirm the certificate language satisfies **your** state's CE requirements.

### 4. Your state's reporting requirements ⚠️
**The included filing code is a Nevada example and will be wrong for any other
state.** Replace it with your jurisdiction's actual forms, fields, deadlines, and
submission addresses:
- **`lib/filing/form-901.ts`** — sponsor identity, instructor of record, the
  department/form header, submission instructions, and the spreadsheet layout.
- **`app/admin/sessions/filing-actions.ts`** and **`lib/cascade/email.ts`** —
  the filing recipient addresses (placeholders like `roster-filing@your-state.gov`).
- `lib/filing/roster-785a.ts` / `lib/filing/eval-612c.ts` — the roster and
  evaluation-summary documents (Nevada 785a/612C formats).

---

## ⚠️ Before you go live: get your course approved

This software helps you *administer* classes — it does **not** make your class
legal to offer for CE credit. **You must get YOUR course approved by YOUR
state's real-estate division (or equivalent regulator) before issuing any CE
credit.** The included filing formats (785a / 612C / 901) and the Nevada Real
Estate Division addresses are a worked example for one state; your jurisdiction's
forms, deadlines, and submission addresses will differ. Confirm them with your
regulator.

---

## License

[MIT](./LICENSE) © Utopia Home Staging. Use it, fork it, ship your own CE program.
