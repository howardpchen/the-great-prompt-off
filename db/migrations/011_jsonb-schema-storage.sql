-- Transitional JSONB-first storage for future challenge modes.
--
-- This migration is additive only. The existing six-field columns remain in
-- place and authoritative until application dual-read/dual-write support is
-- implemented in a later phase. It does not activate any dormant challenge
-- mode and does not change runtime behavior by itself.

alter table public.challenges
  add column if not exists mode_id text,
  add column if not exists schema_version integer;

alter table public.prompt_runs
  add column if not exists mode_id text,
  add column if not exists schema_version integer,
  add column if not exists schema_snapshot jsonb;

alter table public.answer_keys
  add column if not exists answer_values jsonb;

alter table public.prompt_run_items
  add column if not exists scored_values jsonb;

alter table public.submissions
  add column if not exists mode_id text,
  add column if not exists schema_version integer;

-- Existing production rows are the six-field knee MRI challenge.
update public.challenges
set mode_id = 'knee_mri_6_basic'
where mode_id is null;

update public.challenges
set schema_version = 1
where schema_version is null;

update public.answer_keys
set answer_values = jsonb_build_object(
  'acl_tear', acl_tear,
  'mcl_injury', mcl_injury,
  'meniscus_tear', meniscus_tear,
  'fracture', fracture,
  'osteoarthritis', osteoarthritis,
  'effusion', effusion
)
where answer_values is null;

update public.prompt_runs
set mode_id = 'knee_mri_6_basic'
where mode_id is null;

update public.prompt_runs
set schema_version = 1
where schema_version is null;

update public.prompt_runs
set schema_snapshot = jsonb_build_object(
  'id', 'knee_mri_6_basic',
  'version', 1,
  'title', 'Knee MRI Extraction Challenge',
  'domain', 'knee_mri',
  'fields', jsonb_build_array(
    jsonb_build_object(
      'key', 'acl_tear',
      'label', 'ACL tear',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    ),
    jsonb_build_object(
      'key', 'mcl_injury',
      'label', 'MCL injury',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    ),
    jsonb_build_object(
      'key', 'meniscus_tear',
      'label', 'Meniscus tear',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    ),
    jsonb_build_object(
      'key', 'fracture',
      'label', 'Fracture',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    ),
    jsonb_build_object(
      'key', 'osteoarthritis',
      'label', 'Osteoarthritis',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    ),
    jsonb_build_object(
      'key', 'effusion',
      'label', 'Effusion',
      'allowedValues', jsonb_build_array('present', 'absent', 'uncertain', 'not_reported')
    )
  )
)
where schema_snapshot is null;

-- Populate generic scored values only when at least one legacy prediction is
-- present. Null legacy columns are omitted from the transitional JSON object.
update public.prompt_run_items
set scored_values = jsonb_strip_nulls(jsonb_build_object(
  'acl_tear', acl_tear,
  'mcl_injury', mcl_injury,
  'meniscus_tear', meniscus_tear,
  'fracture', fracture,
  'osteoarthritis', osteoarthritis,
  'effusion', effusion
))
where scored_values is null
  and (
    acl_tear is not null
    or mcl_injury is not null
    or meniscus_tear is not null
    or fracture is not null
    or osteoarthritis is not null
    or effusion is not null
  );

update public.submissions as submissions
set
  mode_id = coalesce(submissions.mode_id, runs.mode_id, 'knee_mri_6_basic'),
  schema_version = coalesce(submissions.schema_version, runs.schema_version, 1)
from public.prompt_runs as runs
where runs.id = submissions.prompt_run_id
  and (submissions.mode_id is null or submissions.schema_version is null);

update public.submissions
set mode_id = 'knee_mri_6_basic'
where mode_id is null;

update public.submissions
set schema_version = 1
where schema_version is null;

-- Nullable columns intentionally remain nullable during this transition.
-- These checks only enforce basic shape/version safety and do not validate
-- field keys yet; schema-key validation belongs in a later dual-write phase.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_schema_version_positive'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_schema_version_positive
      check (schema_version is null or schema_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'prompt_runs_schema_version_positive'
      and conrelid = 'public.prompt_runs'::regclass
  ) then
    alter table public.prompt_runs
      add constraint prompt_runs_schema_version_positive
      check (schema_version is null or schema_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'prompt_runs_schema_snapshot_object'
      and conrelid = 'public.prompt_runs'::regclass
  ) then
    alter table public.prompt_runs
      add constraint prompt_runs_schema_snapshot_object
      check (schema_snapshot is null or jsonb_typeof(schema_snapshot) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'answer_keys_answer_values_object'
      and conrelid = 'public.answer_keys'::regclass
  ) then
    alter table public.answer_keys
      add constraint answer_keys_answer_values_object
      check (answer_values is null or jsonb_typeof(answer_values) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'prompt_run_items_scored_values_object'
      and conrelid = 'public.prompt_run_items'::regclass
  ) then
    alter table public.prompt_run_items
      add constraint prompt_run_items_scored_values_object
      check (scored_values is null or jsonb_typeof(scored_values) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'submissions_schema_version_positive'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_schema_version_positive
      check (schema_version is null or schema_version > 0);
  end if;
end
$$;

create index if not exists challenges_mode_schema_idx
  on public.challenges (mode_id, schema_version);

create index if not exists prompt_runs_mode_schema_idx
  on public.prompt_runs (mode_id, schema_version);

create index if not exists submissions_mode_schema_idx
  on public.submissions (mode_id, schema_version);

comment on column public.challenges.mode_id is
  'Transitional challenge mode identifier. Runtime activation is deferred until mode locking is implemented.';
comment on column public.challenges.schema_version is
  'Transitional challenge schema version. Nullable for additive migration compatibility.';
comment on column public.prompt_runs.schema_snapshot is
  'Immutable schema snapshot for future historical run compatibility; not yet consumed by runtime code.';
comment on column public.answer_keys.answer_values is
  'Transitional generic answer-key JSON. Existing six-field columns remain authoritative until dual-read/dual-write support exists.';
comment on column public.prompt_run_items.scored_values is
  'Transitional generic normalized prediction JSON. Existing six prediction columns remain authoritative until runtime migration.';
