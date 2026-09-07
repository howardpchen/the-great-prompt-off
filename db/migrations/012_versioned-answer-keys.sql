-- Phase 7C: versioned answer-key storage.
--
-- This migration is additive. Existing six-field columns and rows remain in
-- place and are backfilled as knee_mri_6_basic version 1. The application is
-- not yet writing dormant-mode answer keys; this migration only makes that
-- storage safe for a later phase.
--
-- supabase/schema.sql declares `report_id uuid not null unique`. PostgreSQL
-- names that inline unique constraint `answer_keys_report_id_key` in a fresh
-- database. Drop only that known constraint name, if present, so one report
-- can later have one key per mode/version.

alter table public.answer_keys
  add column if not exists mode_id text,
  add column if not exists schema_version integer;

update public.answer_keys
set mode_id = 'knee_mri_6_basic'
where mode_id is null;

update public.answer_keys
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

alter table public.answer_keys
  drop constraint if exists answer_keys_report_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.answer_keys'::regclass
      and conname = 'answer_keys_schema_version_positive'
  ) then
    alter table public.answer_keys
      add constraint answer_keys_schema_version_positive
      check (schema_version is null or schema_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.answer_keys'::regclass
      and conname = 'answer_keys_answer_values_object'
  ) then
    alter table public.answer_keys
      add constraint answer_keys_answer_values_object
      check (answer_values is null or jsonb_typeof(answer_values) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.answer_keys'::regclass
      and conname = 'answer_keys_mode_id_nonempty'
  ) then
    alter table public.answer_keys
      add constraint answer_keys_mode_id_nonempty
      check (mode_id is null or length(trim(mode_id)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.answer_keys'::regclass
      and conname = 'answer_keys_report_mode_version_key'
  ) then
    alter table public.answer_keys
      add constraint answer_keys_report_mode_version_key
      unique (report_id, mode_id, schema_version);
  end if;
end;
$$;

create index if not exists answer_keys_mode_schema_idx
  on public.answer_keys (mode_id, schema_version);

comment on column public.answer_keys.mode_id is
  'Challenge mode used by this answer key. Existing rows are knee_mri_6_basic.';
comment on column public.answer_keys.schema_version is
  'Version of the challenge mode schema used by this answer key.';
comment on column public.answer_keys.answer_values is
  'Generic mode-specific answer values. Legacy six-field columns remain for compatibility.';

