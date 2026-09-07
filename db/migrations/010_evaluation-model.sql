-- Add the optional active-challenge model override.
-- Run this once in Supabase before deploying the admin model selector.

alter table challenges
  add column if not exists evaluation_model text null;

alter table challenges
  drop constraint if exists challenges_evaluation_model_nonempty;

alter table challenges
  add constraint challenges_evaluation_model_nonempty
  check (evaluation_model is null or length(trim(evaluation_model)) > 0);

comment on column challenges.evaluation_model is
  'Optional admin-selected OpenRouter model override. Null falls back to OPENROUTER_MODEL.';
