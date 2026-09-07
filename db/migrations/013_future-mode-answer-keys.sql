-- Phase 7E: permit JSONB-only answer-key rows for future challenge modes.
--
-- Run supabase/versioned-answer-keys.sql first. The original six finding
-- columns remain authoritative compatibility storage for knee_mri_6_basic v1,
-- but they cannot remain NOT NULL if another mode has a different field set.
-- This migration does not delete data, activate a mode, or expose answer keys.

alter table public.answer_keys
  alter column acl_tear drop not null,
  alter column mcl_injury drop not null,
  alter column meniscus_tear drop not null,
  alter column fracture drop not null,
  alter column osteoarthritis drop not null,
  alter column effusion drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.answer_keys'::regclass
      and conname = 'answer_keys_knee_mri_6_legacy_values_required'
  ) then
    alter table public.answer_keys
      add constraint answer_keys_knee_mri_6_legacy_values_required
      check (
        not (mode_id = 'knee_mri_6_basic' and schema_version = 1)
        or (
          acl_tear is not null
          and mcl_injury is not null
          and meniscus_tear is not null
          and fracture is not null
          and osteoarthritis is not null
          and effusion is not null
        )
      );
  end if;
end;
$$;

comment on constraint answer_keys_knee_mri_6_legacy_values_required
  on public.answer_keys is
  'Keeps legacy six-field columns populated for knee_mri_6_basic v1 while allowing JSONB-only future-mode rows.';
