-- Isolated storage for future admin-only challenge simulations.
--
-- This migration is additive. Simulation data is deliberately separated from
-- participants, prompt_runs, prompt_run_items, and submissions so it cannot
-- affect attempts, event locking, leaderboards, progress, exports, or real
-- analytics. Phase 9B dry-runs remain non-persistent until a later app phase.

create table if not exists public.simulation_batches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  mode_id text not null,
  schema_version integer not null,
  schema_snapshot jsonb not null,
  evaluator_type text not null,
  model text,
  report_scope text not null,
  status text not null,
  report_count integer not null,
  field_count integer not null,
  profile_count integer not null,
  total_evaluations integer not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint simulation_batches_schema_version_positive
    check (schema_version > 0),
  constraint simulation_batches_schema_snapshot_object
    check (jsonb_typeof(schema_snapshot) = 'object'),
  constraint simulation_batches_evaluator_type_allowed
    check (evaluator_type in ('deterministic_mock')),
  constraint simulation_batches_report_scope_allowed
    check (report_scope in ('public', 'private', 'all')),
  constraint simulation_batches_status_allowed
    check (status in ('running', 'completed', 'failed')),
  constraint simulation_batches_report_count_nonnegative
    check (report_count >= 0),
  constraint simulation_batches_field_count_positive
    check (field_count > 0),
  constraint simulation_batches_profile_count_nonnegative
    check (profile_count >= 0),
  constraint simulation_batches_total_evaluations_nonnegative
    check (total_evaluations >= 0)
);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  simulation_batch_id uuid not null references public.simulation_batches(id) on delete cascade,
  profile_id text not null,
  profile_version integer not null,
  profile_label text not null,
  strategy_snapshot text not null,
  correct_fields integer not null,
  total_fields integer not null,
  score numeric(6, 3) not null,
  valid_json_count integer not null,
  invalid_json_count integer not null,
  missing_field_count integer not null,
  invalid_value_count integer not null,
  completed_report_count integer not null,
  created_at timestamptz not null default now(),
  constraint simulation_runs_profile_version_positive
    check (profile_version > 0),
  constraint simulation_runs_correct_fields_valid
    check (correct_fields >= 0 and correct_fields <= total_fields),
  constraint simulation_runs_total_fields_nonnegative
    check (total_fields >= 0),
  -- Scores follow the existing application convention: percentage points.
  constraint simulation_runs_score_percentage
    check (score >= 0 and score <= 100),
  constraint simulation_runs_json_counts_nonnegative
    check (valid_json_count >= 0 and invalid_json_count >= 0),
  constraint simulation_runs_diagnostic_counts_nonnegative
    check (missing_field_count >= 0 and invalid_value_count >= 0),
  constraint simulation_runs_completed_report_count_nonnegative
    check (completed_report_count >= 0),
  constraint simulation_runs_json_counts_within_completed
    check (valid_json_count + invalid_json_count <= completed_report_count)
);

create table if not exists public.simulation_run_items (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid not null references public.simulation_runs(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  correct_fields integer not null,
  total_fields integer not null,
  score numeric(6, 3) not null,
  valid_json boolean not null,
  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',
  scored_values jsonb,
  created_at timestamptz not null default now(),
  constraint simulation_run_items_correct_fields_valid
    check (correct_fields >= 0 and correct_fields <= total_fields),
  constraint simulation_run_items_total_fields_nonnegative
    check (total_fields >= 0),
  constraint simulation_run_items_score_percentage
    check (score >= 0 and score <= 100),
  constraint simulation_run_items_scored_values_object
    check (scored_values is null or jsonb_typeof(scored_values) = 'object')
);

create index if not exists simulation_batches_challenge_created_idx
  on public.simulation_batches (challenge_id, created_at desc);

create index if not exists simulation_batches_mode_schema_idx
  on public.simulation_batches (mode_id, schema_version);

create index if not exists simulation_runs_batch_idx
  on public.simulation_runs (simulation_batch_id);

create index if not exists simulation_run_items_run_idx
  on public.simulation_run_items (simulation_run_id);

comment on table public.simulation_batches is
  'Admin-only simulation batches isolated from real event participants, runs, submissions, attempts, locks, leaderboards, and analytics.';
comment on table public.simulation_runs is
  'Versioned synthetic strategy results belonging only to an admin simulation batch.';
comment on table public.simulation_run_items is
  'Per-report simulation diagnostics. Does not store answer keys, report text, or raw model output.';

-- Defense in depth: future APIs must also require an admin session before
-- using the service-role client. No participant-facing database role receives
-- direct access to simulation storage.
alter table public.simulation_batches disable row level security;
alter table public.simulation_runs disable row level security;
alter table public.simulation_run_items disable row level security;









create or replace function public.admin_delete_simulation_batch(
  target_batch_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.simulation_batches
  where id = target_batch_id;
end;
$$;

comment on function public.admin_delete_simulation_batch(uuid) is
  'Service-role-only cleanup for one simulation batch. Cascades only to its simulation runs and items.';

create or replace function public.admin_clear_simulation_data(
  target_challenge_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.simulation_batches
  where challenge_id = target_challenge_id;
end;
$$;

comment on function public.admin_clear_simulation_data(uuid) is
  'Service-role-only cleanup for all simulation batches belonging to one challenge. Real event data is preserved.';






