-- Add the two filing-generation timestamps that filing-actions.ts already writes.
-- Until these columns existed, generate785aRosterAction / generate612cSummaryAction
-- wrote them as a silent no-op, so FilingSection never reached "draft_ready" and
-- Mark-as-Filed / Draft-to-Outlook were unreachable. Additive only — nullable, no
-- default, no backfill — so no existing row data is mutated.
alter table public.ce_sessions
  add column if not exists roster_generated_at timestamptz,
  add column if not exists eval_summary_generated_at timestamptz;
