-- Phase 6C: guarded server-side challenge schema update.
-- The application validates the registry mode and every answer key first.
-- This RPC re-checks event cleanliness and updates the three challenge
-- configuration fields in one transaction. It never changes historical runs.

create or replace function public.admin_update_challenge_schema(
  target_mode_id text,
  target_schema_version integer,
  target_output_schema jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_challenge_id uuid;
begin
  select id into active_challenge_id
  from challenges
  where is_active = true
  order by created_at desc
  limit 1
  for update;

  if active_challenge_id is null then
    raise exception 'No active challenge was found.' using errcode = 'P0002';
  end if;

  if target_mode_id is null or length(trim(target_mode_id)) = 0 then
    raise exception 'That challenge mode is not available for activation.';
  end if;

  if target_schema_version is null or target_schema_version <= 0 then
    raise exception 'That schema version is not supported for the selected challenge mode.';
  end if;

  if target_output_schema is null or jsonb_typeof(target_output_schema) <> 'object' then
    raise exception 'That challenge mode output schema is invalid.';
  end if;

  if exists (select 1 from submissions where challenge_id = active_challenge_id)
     or exists (select 1 from prompt_runs where challenge_id = active_challenge_id)
     or exists (
       select 1
       from prompt_run_items i
       join prompt_runs r on r.id = i.prompt_run_id
       where r.challenge_id = active_challenge_id
     )
     or exists (select 1 from participant_attempt_overrides) then
    raise exception 'Reset workshop run data before changing the challenge mode.' using errcode = '55000';
  end if;

  update challenges
  set mode_id = target_mode_id,
      schema_version = target_schema_version,
      output_schema = target_output_schema,
      updated_at = now()
  where id = active_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'mode_id', target_mode_id,
    'schema_version', target_schema_version
  );
end;
$$;



