-- ───────────────────────────────────────────────────────────────────────────
-- BASE SCHEMA — CE Classes Admin starter
--
-- This migration creates the core tables and helper functions the app reads and
-- writes. It is SCHEMA ONLY — no seed rows, no real data. The dated migrations
-- that follow ALTER these tables (e.g. adding Stripe/payment columns).
--
-- In the original project these base tables were created ad-hoc, so this file
-- was reconstructed from the application's actual column usage. Review the
-- types/constraints and adjust to taste before running against your own
-- Supabase project (`supabase db push`, or paste into the SQL editor).
--
-- Row Level Security: all tables are RLS-enabled. The app's reads/writes go
-- through the SERVICE ROLE (server-side admin client), which bypasses RLS. The
-- authenticated-read policies below let a signed-in admin read via the browser
-- client if you choose to. Public/anonymous form submissions go through Server
-- Actions using the service role — there are intentionally no anon policies.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Courses ──────────────────────────────────────────────────────────────────
create table if not exists ce_courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  course_number text,
  credit_hours  numeric(4,1) not null default 3,
  instructor    text,
  fee_cents     integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ── Sessions (a scheduled instance of a course) ──────────────────────────────
create table if not exists ce_sessions (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references ce_courses(id) on delete restrict,
  session_date         date not null,
  start_time           time,
  end_time             time,
  location_name        text,
  location_address     text,
  coordinator_name     text,
  coordinator_email    text,
  status               text not null default 'scheduled',
  filing_deadline      date,
  cascade_status       jsonb not null default '{}'::jsonb,
  flyer_url            text,
  calendar_event_id    text,
  registered_count     integer not null default 0,
  checked_in_count     integer not null default 0,
  evaluated_count      integer not null default 0,
  filed_785a_at        timestamptz,
  filed_612c_at        timestamptz,
  -- Added by later migrations too (IF NOT EXISTS there) — declared here for clarity:
  fee_cents            integer,
  attached_coupon_code text,
  created_at           timestamptz not null default now()
);

-- ── Attendees (registrations) ────────────────────────────────────────────────
create table if not exists ce_attendees (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid not null references ce_sessions(id) on delete cascade,
  first_name                  text not null default '',
  last_name                   text not null default '',
  license_number              text not null default '',
  email                       text not null,
  phone                       text,
  status                      text not null default 'registered',
  checked_in_at               timestamptz,
  -- Payment columns (also added IF NOT EXISTS by the dated Stripe migration):
  paid_amount_cents           integer not null default 0,
  coupon_code                 text,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  refunded_total_cents        integer not null default 0,
  created_at                  timestamptz not null default now(),
  -- One registration per license per session.
  unique (session_id, license_number)
);

-- ── Check-ins ────────────────────────────────────────────────────────────────
create table if not exists ce_check_ins (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references ce_sessions(id) on delete cascade,
  attendee_id   uuid not null references ce_attendees(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (session_id, attendee_id)
);

-- ── Evaluations (NRED-style instructor/content ratings 1..5) ─────────────────
create table if not exists ce_evaluations (
  id                              uuid primary key default gen_random_uuid(),
  session_id                      uuid not null references ce_sessions(id) on delete cascade,
  attendee_id                     uuid not null references ce_attendees(id) on delete cascade,
  instructor_knowledge            integer,
  instructor_questions_examples   integer,
  instructor_presented_topics     integer,
  instructor_timely               integer,
  instructor_control_disruptions  integer,
  content_objectives              integer,
  content_organization            integer,
  content_practical_value         integer,
  content_resource_value          integer,
  content_current                 integer,
  comments_not_acceptable         text,
  additional_comments             text,
  created_at                      timestamptz not null default now(),
  unique (session_id, attendee_id)
);

-- ── Certificates ─────────────────────────────────────────────────────────────
create table if not exists ce_certificates (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references ce_sessions(id) on delete cascade,
  attendee_id      uuid not null references ce_attendees(id) on delete cascade,
  attendee_name    text,
  license_number   text,
  course_title     text,
  course_number    text,
  credit_hours     numeric(4,1),
  session_date     date,
  sponsor          text,
  instructor       text,
  pdf_storage_path text,
  pdf_url          text,
  delivery_status  text not null default 'pending',
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (session_id, attendee_id)
);

-- ── Flodesk sync queue (consumed by an external background worker) ───────────
create table if not exists ce_flodesk_syncs (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid references ce_sessions(id) on delete set null,
  target_session_id uuid references ce_sessions(id) on delete set null,
  synced_by         text,
  attendee_count    integer not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  synced_at         timestamptz not null default now()
);

-- ── Counter RPCs (atomic increments; app falls back to read-modify-write) ────
create or replace function increment_registered_count(p_session_id uuid)
returns void language sql as $$
  update ce_sessions set registered_count = coalesce(registered_count, 0) + 1 where id = p_session_id;
$$;

create or replace function increment_checked_in_count(p_session_id uuid)
returns void language sql as $$
  update ce_sessions set checked_in_count = coalesce(checked_in_count, 0) + 1 where id = p_session_id;
$$;

create or replace function increment_evaluated_count(p_session_id uuid)
returns void language sql as $$
  update ce_sessions set evaluated_count = coalesce(evaluated_count, 0) + 1 where id = p_session_id;
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- The app writes via the service role (bypasses RLS). These policies only
-- grant authenticated (signed-in admin) READ access via the browser client.
do $$
declare t text;
begin
  foreach t in array array[
    'ce_courses','ce_sessions','ce_attendees','ce_check_ins',
    'ce_evaluations','ce_certificates','ce_flodesk_syncs'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_authenticated_read', t
    );
  end loop;
end $$;
