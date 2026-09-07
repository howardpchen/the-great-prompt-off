-- Additive simulation-only reference baseline support.
--
-- Reference metadata lives only on simulation_batches. It does not affect real
-- participants, prompt runs, submissions, attempts, leaderboards, analytics,
-- event locks, or challenge activation.

alter table public.simulation_batches
  add column if not exists is_reference boolean not null default false,
  add column if not exists reference_label text,
  add column if not exists reference_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.simulation_batches'::regclass
      and conname = 'simulation_batches_reference_completed_deterministic'
  ) then
    alter table public.simulation_batches
      add constraint simulation_batches_reference_completed_deterministic
      check (
        not is_reference
        or (status = 'completed' and evaluator_type = 'deterministic_mock')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.simulation_batches'::regclass
      and conname = 'simulation_batches_reference_label_length'
  ) then
    alter table public.simulation_batches
      add constraint simulation_batches_reference_label_length
      check (reference_label is null or char_length(reference_label) <= 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.simulation_batches'::regclass
      and conname = 'simulation_batches_reference_notes_length'
  ) then
    alter table public.simulation_batches
      add constraint simulation_batches_reference_notes_length
      check (reference_notes is null or char_length(reference_notes) <= 240);
  end if;
end;
$$;

create unique index if not exists simulation_batches_one_reference_per_challenge_idx
  on public.simulation_batches (challenge_id)
  where is_reference;

create or replace function public.admin_set_simulation_reference(
  target_challenge_id uuid,
  target_batch_id uuid,
  target_reference_label text default null,
  target_reference_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_status text;
  target_evaluator_type text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_challenge_id::text, 0));

  select status, evaluator_type
  into target_status, target_evaluator_type
  from public.simulation_batches
  where id = target_batch_id
    and challenge_id = target_challenge_id
  for update;

  if not found then
    raise exception 'Simulation batch not found.';
  end if;

  if target_status <> 'completed' then
    raise exception 'Only completed simulation batches can be references.';
  end if;

  if target_evaluator_type <> 'deterministic_mock' then
    raise exception 'Only deterministic simulation batches can be references.';
  end if;

  update public.simulation_batches
  set
    is_reference = false,
    reference_label = null,
    reference_notes = null
  where challenge_id = target_challenge_id
    and is_reference
    and id <> target_batch_id;

  update public.simulation_batches
  set
    is_reference = true,
    reference_label = nullif(btrim(target_reference_label), ''),
    reference_notes = nullif(btrim(target_reference_notes), '')
  where id = target_batch_id
    and challenge_id = target_challenge_id;
end;
$$;

comment on function public.admin_set_simulation_reference(uuid, uuid, text, text) is
  'Atomically replaces the simulation-only reference baseline for one challenge. Service-role use only.';

create or replace function public.admin_clear_simulation_reference(
  target_challenge_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(target_challenge_id::text, 0));

  update public.simulation_batches
  set
    is_reference = false,
    reference_label = null,
    reference_notes = null
  where challenge_id = target_challenge_id
    and is_reference;
end;
$$;

comment on function public.admin_clear_simulation_reference(uuid) is
  'Clears simulation-only reference metadata for one challenge. Service-role use only.';






