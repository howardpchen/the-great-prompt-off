-- Transaction-safe admin clearing helpers.
-- Run this in Supabase before deploying the app code that calls these RPCs.

create or replace function public.admin_clear_participant_run_data(
  target_participant_code text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_participant_id uuid;
begin
  select id
    into target_participant_id
  from participants
  where participant_code = trim(target_participant_code) FOR UPDATE;

  if target_participant_id is null then
    raise exception 'Participant % not found.', target_participant_code;
  end if;

  delete from attempt_reservations where participant_id = target_participant_id;

  delete from prompt_run_items
  where prompt_run_id in (
    select id from prompt_runs where participant_id = target_participant_id
  );

  delete from submissions
  where participant_id = target_participant_id;

  delete from prompt_runs
  where participant_id = target_participant_id;

  delete from participant_attempt_overrides
  where participant_code = trim(target_participant_code);
end;
$$;

comment on function public.admin_clear_participant_run_data(text) is
  'Admin-only RPC. Atomically deletes prompt_run_items, submissions, prompt_runs, and Test Attempt overrides for one participant while preserving participant identity, access codes, reports, answer keys, and challenges.';

create or replace function public.admin_reset_workshop_run_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  PERFORM id FROM participants ORDER BY id FOR UPDATE;
  delete from attempt_reservations where true;
  delete from prompt_run_items where true;
  delete from submissions where true;
  delete from prompt_runs where true;
  delete from participant_attempt_overrides where true;
end;
$$;

comment on function public.admin_reset_workshop_run_data() is
  'Admin-only RPC. Atomically deletes all prompt_run_items, submissions, prompt_runs, and Test Attempt overrides while preserving participants, access codes, reports, answer keys, and challenges.';







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
  if (exists (
    select 1
    from public.submissions s
    where s.challenge_id = old.id
  ) OR exists (SELECT 1 FROM attempt_reservations WHERE challenge_id=old.id AND status='pending') ) and (
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


REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
