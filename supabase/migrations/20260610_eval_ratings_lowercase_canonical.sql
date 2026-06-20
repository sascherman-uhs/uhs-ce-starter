-- Eval rating values: align DB with app's canonical lowercase enum
-- ('excellent' | 'average' | 'not_acceptable').
--
-- An earlier historical backfill may have inserted Title Case values ('Excellent',
-- 'Average', 'Not Acceptable') via raw SQL, and chk_eval_ratings was created
-- to match that data. The eval form, server action, and 612C tally code all
-- use lowercase, so every live form submission failed the CHECK (23514) with
-- "Evaluation submission failed. Please try again."
--
-- Applied to your remote Supabase project 2026-06-10 via MCP
-- apply_migration as `eval_ratings_lowercase_canonical`. This file is the
-- repo-parity copy.

ALTER TABLE ce_evaluations DROP CONSTRAINT chk_eval_ratings;

UPDATE ce_evaluations SET
  instructor_knowledge           = lower(replace(instructor_knowledge, ' ', '_')),
  instructor_questions_examples  = lower(replace(instructor_questions_examples, ' ', '_')),
  instructor_presented_topics    = lower(replace(instructor_presented_topics, ' ', '_')),
  instructor_timely              = lower(replace(instructor_timely, ' ', '_')),
  instructor_control_disruptions = lower(replace(instructor_control_disruptions, ' ', '_')),
  content_objectives             = lower(replace(content_objectives, ' ', '_')),
  content_organization           = lower(replace(content_organization, ' ', '_')),
  content_practical_value        = lower(replace(content_practical_value, ' ', '_')),
  content_resource_value         = lower(replace(content_resource_value, ' ', '_')),
  content_current                = lower(replace(content_current, ' ', '_'));

ALTER TABLE ce_evaluations ADD CONSTRAINT chk_eval_ratings CHECK (
  instructor_knowledge           IN ('excellent', 'average', 'not_acceptable') AND
  instructor_questions_examples  IN ('excellent', 'average', 'not_acceptable') AND
  instructor_presented_topics    IN ('excellent', 'average', 'not_acceptable') AND
  instructor_timely              IN ('excellent', 'average', 'not_acceptable') AND
  instructor_control_disruptions IN ('excellent', 'average', 'not_acceptable') AND
  content_objectives             IN ('excellent', 'average', 'not_acceptable') AND
  content_organization           IN ('excellent', 'average', 'not_acceptable') AND
  content_practical_value        IN ('excellent', 'average', 'not_acceptable') AND
  content_resource_value         IN ('excellent', 'average', 'not_acceptable') AND
  content_current                IN ('excellent', 'average', 'not_acceptable')
);
