-- Additive Phase 8B migration for answer-key provenance and import batches.
-- Answer values remain server/admin-only. This metadata distinguishes staging
-- rehearsal data from clinician-adjudicated data without changing active scoring.

alter table public.answer_keys
  add column if not exists provenance text,
  add column if not exists import_batch_id text,
  add column if not exists adjudicated_by text,
  add column if not exists adjudicated_at timestamp with time zone,
  add column if not exists notes text;

update public.answer_keys
set provenance = 'legacy'
where mode_id = 'knee_mri_6_basic'
  and schema_version = 1
  and (provenance is null or provenance = 'unknown');

update public.answer_keys
set provenance = 'unknown'
where provenance is null;

alter table public.answer_keys
  alter column provenance set default 'unknown',
  alter column provenance set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'answer_keys_provenance_check'
      and conrelid = 'public.answer_keys'::regclass
  ) then
    alter table public.answer_keys
      add constraint answer_keys_provenance_check
      check (provenance in (
        'legacy',
        'staging_demo',
        'clinician_adjudicated',
        'imported',
        'unknown'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'answer_keys_import_batch_id_check'
      and conrelid = 'public.answer_keys'::regclass
  ) then
    alter table public.answer_keys
      add constraint answer_keys_import_batch_id_check
      check (import_batch_id is null or length(btrim(import_batch_id)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'answer_keys_adjudicator_check'
      and conrelid = 'public.answer_keys'::regclass
  ) then
    alter table public.answer_keys
      add constraint answer_keys_adjudicator_check
      check (
        provenance <> 'clinician_adjudicated'
        or (
          adjudicated_by is not null
          and length(btrim(adjudicated_by)) > 0
          and adjudicated_at is not null
        )
      );
  end if;
end
$$;

create index if not exists answer_keys_mode_schema_provenance_idx
  on public.answer_keys (mode_id, schema_version, provenance);

create index if not exists answer_keys_import_batch_id_idx
  on public.answer_keys (import_batch_id)
  where import_batch_id is not null;

comment on column public.answer_keys.provenance is
  'Admin-only provenance classification for answer-key readiness.';
comment on column public.answer_keys.import_batch_id is
  'Optional identifier grouping answer keys written by one import.';
comment on column public.answer_keys.adjudicated_by is
  'Admin-only identity or role of the clinician adjudicator.';
comment on column public.answer_keys.adjudicated_at is
  'Timestamp when clinical adjudication was completed.';
