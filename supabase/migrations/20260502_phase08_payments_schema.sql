-- Phase 8: Course registration payments — schema additions
-- Implements decisions D-01 (fee on both ce_courses + ce_sessions), D-02 (cents-as-integer),
-- D-11 (attached_coupon_code), D-18 (ce_refunds audit), D-21 (stripe_events idempotency).

-- D-01, D-02: Course-level default fee in cents.
ALTER TABLE ce_courses
  ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0;

-- D-01, D-02, D-11: Session-level fee override (NULL = inherit from course) + attached coupon code.
ALTER TABLE ce_sessions
  ADD COLUMN IF NOT EXISTS fee_cents integer NULL,
  ADD COLUMN IF NOT EXISTS attached_coupon_code text NULL;

-- Per-attendee payment tracking (CONTEXT.md said ce_registrations; actual table is ce_attendees per RESEARCH.md verification).
ALTER TABLE ce_attendees
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code text NULL,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text NULL,
  ADD COLUMN IF NOT EXISTS refunded_total_cents integer NOT NULL DEFAULT 0;

-- Idempotency anchor for webhook fulfillment (UNIQUE-when-not-null).
CREATE UNIQUE INDEX IF NOT EXISTS ce_attendees_stripe_checkout_session_id_idx
  ON ce_attendees (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Lookup index for refund admin action (find attendee by payment intent).
CREATE INDEX IF NOT EXISTS ce_attendees_stripe_payment_intent_id_idx
  ON ce_attendees (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- D-18: Refund audit table.
-- ON DELETE RESTRICT on attendee_id enforces D-19 (registration row preserved on refund).
CREATE TABLE IF NOT EXISTS ce_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid NULL REFERENCES ce_attendees(id) ON DELETE RESTRICT,
  session_id uuid NULL REFERENCES ce_sessions(id) ON DELETE RESTRICT,
  stripe_refund_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NULL,
  stripe_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  raw_event jsonb NULL
);

CREATE INDEX IF NOT EXISTS ce_refunds_attendee_id_idx ON ce_refunds (attendee_id);
CREATE INDEX IF NOT EXISTS ce_refunds_session_id_idx ON ce_refunds (session_id);

-- D-21: Stripe webhook event idempotency log.
CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  payload jsonb NOT NULL
);

-- RLS: ce_refunds — service role writes (webhook + admin server action), authenticated reads (admin dashboard).
ALTER TABLE ce_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ce_refunds_service_all ON ce_refunds;
CREATE POLICY ce_refunds_service_all ON ce_refunds
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ce_refunds_authenticated_read ON ce_refunds;
CREATE POLICY ce_refunds_authenticated_read ON ce_refunds
  FOR SELECT TO authenticated
  USING (true);

-- RLS: stripe_events — service role only (internal table, no anon/authenticated access).
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_events_service_all ON stripe_events;
CREATE POLICY stripe_events_service_all ON stripe_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================================
-- To apply: supabase db push  (or)  psql "$DATABASE_URL" < supabase/migrations/20260502_phase08_payments_schema.sql
-- =====================================================================
-- Notes on deviations from RESEARCH.md:
--   - attendee_id and session_id on ce_refunds are NULL-able (not NOT NULL as
--     RESEARCH.md initially proposed) because the charge.refunded webhook
--     reconciliation path may insert a row before resolving the attendee.
--     The synchronous admin action ALWAYS populates both.
--   - All ALTER TABLE statements use IF NOT EXISTS and all CREATE statements
--     use IF NOT EXISTS so the migration is idempotent (re-running it is safe).
--   - This file is NOT yet applied to your remote Supabase project.
--     Run the apply command above (supabase login + supabase link first, or
--     pipe to psql with DATABASE_URL pointing at the your project project).
-- =====================================================================
