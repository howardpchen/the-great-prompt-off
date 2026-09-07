-- Phase 5C: lock challenge configuration after successful event activity.
--
-- This protects the fields that define score comparability:
-- evaluation_model, mode_id, schema_version, and output_schema. A row in
-- submissions is the durable marker of a successful public or final run.
-- Failed/incomplete prompt_runs and admin calibration do not create that row.
-- The existing reset RPC deletes submissions, so a deliberate full reset
-- returns the challenge to its pre-submission state.

create or replace function public.prevent_locked_challenge_configuration_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.submissions s
    where s.challenge_id = old.id
  ) and (
    old.evaluation_model is distinct from new.evaluation_model
    or old.mode_id is distinct from new.mode_id
    or old.schema_version is distinct from new.schema_version
    or old.output_schema is distinct from new.output_schema
  ) then
    raise exception 'Challenge configuration is locked after the first successful submission.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_challenge_configuration_change
on public.challenges;

create trigger prevent_locked_challenge_configuration_change
before update on public.challenges
for each row
execute function public.prevent_locked_challenge_configuration_change();

