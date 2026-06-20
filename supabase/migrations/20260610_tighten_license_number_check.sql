-- Quick task 260610-81n: tighten ce_attendees.license_number CHECK to reject leading zeros.
--
-- WHY:
--   NRED Form 785A requires real-estate license numbers with NO leading zeros after the
--   prefix dot. NAC 645.695 attaches a $500-per-violation penalty to a non-compliant roster.
--   The app already enforces the strict format on every UI/registration insert, but a direct
--   SQL insert bypasses the app, and the previous DB constraint was looser
--   (`^(S|BS|B|PM|PB)\.\d{1,7}$` — `\d{1,7}` happily accepts `S.0000000`). This migration
--   closes that last bypass so the database itself rejects leading-zero values.
--
--   `lib/registration/license.ts` `LICENSE_NUMBER_REGEX` (= /^(S|BS|B|PM|PB)\.[1-9]\d{0,6}$/)
--   is the CANONICAL source of truth. The DB constraint below is its SQL-equivalent twin —
--   keep the two semantically identical. The first digit after the dot must be 1-9 (no leading
--   zero), then 0-6 more digits (1-7 digits total).
--
--   NOTE: `[0-9]` is used here (not `\d`) to avoid backslash-escaping ambiguity across the SQL
--   string layer; behavior is identical for this input set. The only backslash in the pattern
--   is the `\.` (literal period), which Postgres POSIX `~` treats as a literal dot.

-- Idempotent: drop any prior definition of the constraint first so re-running is safe and the
-- prior (loose) definition is tolerated regardless of its exact form.
ALTER TABLE ce_attendees
  DROP CONSTRAINT IF EXISTS chk_license_number_format;

-- Re-add the stricter, no-leading-zeros constraint.
ALTER TABLE ce_attendees
  ADD CONSTRAINT chk_license_number_format
  CHECK (license_number ~ '^(S|BS|B|PM|PB)\.[1-9][0-9]{0,6}$');

-- =====================================================================
-- To apply: this migration is applied to your remote Supabase project via the Supabase MCP `apply_migration` tool.
--   Alternatively: supabase db push  (or)  psql "$DATABASE_URL" < this file.
-- =====================================================================
-- Notes:
--   - DROP+ADD is safe: 0 of 57 existing ce_attendees rows violate the new regex, so the
--     ADD CONSTRAINT re-validation pass will NOT fail. Existing leading-zero rows
--     (June 10 Coldwell Banker) were already normalized to canonical form before this ran.
--   - This migration changes the CONSTRAINT ONLY. No data backfill is in scope here.
--   - The DROP uses IF EXISTS and the constraint name is stable, so re-running this migration
--     is idempotent (the ADD is a no-op delta when the constraint already carries this regex,
--     and the DROP cleanly removes the old form first either way).
-- =====================================================================
