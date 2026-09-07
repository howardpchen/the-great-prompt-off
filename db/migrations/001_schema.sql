-- Draft Supabase/Postgres schema for the future database-backed challenge app.
-- This file is documentation-first for now; the app is not connected to Supabase yet.

create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'participant');
create type report_split as enum ('sample', 'public', 'private');
create type submission_type as enum ('public', 'final');
create type run_type as enum ('sample', 'public_submission', 'final_submission');
create type finding_value as enum ('present', 'absent', 'uncertain', 'not_reported');

create table participants (
  id uuid primary key default gen_random_uuid(),
  participant_code text not null unique,
  access_code text not null unique,
  display_name text,
  email text,
  is_active boolean not null default true,
  role app_role not null default 'participant',
  auth_user_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(participant_code)) > 0),
  check (access_code ~ '^GPO-[A-Z0-9]{4}-[A-Z0-9]{4}$')
);

comment on table participants is
  'Stores workshop participant/admin identities. participant_code is the friendly label; access_code is the unguessable workshop entry code.';
comment on column participants.access_code is
  'Unique workshop access code used before full email/password authentication exists. Keep server/admin-only.';
comment on column participants.auth_user_id is
  'Future optional link to Supabase auth.users.id when authentication is added.';

create table participant_attempt_overrides (
  participant_code text primary key references participants(participant_code) on update cascade on delete cascade,
  extra_public_attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  check (extra_public_attempts >= 0)
);

comment on table participant_attempt_overrides is
  'Stores narrow admin overrides for extra public Test Attempts. Does not affect Final Submission.';
comment on column participant_attempt_overrides.extra_public_attempts is
  'Additional public Test Attempts granted by an admin for this participant.';

create table challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  instructions text,
  output_schema jsonb not null,
  locked_model text not null,
  evaluation_model text null,
  public_submission_limit integer not null default 5,
  final_submission_limit integer not null default 1,
  event_phase text not null default 'not_started',
  leaderboard_visibility text not null default 'practice',
  event_announcement text not null default '',
  event_timer_ends_at timestamptz null,
  event_timer_label text not null default '',
  is_active boolean not null default false,
  created_by uuid references participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(slug)) > 0),
  check (length(trim(title)) > 0),
  check (length(trim(locked_model)) > 0),
  check (evaluation_model is null or length(trim(evaluation_model)) > 0),
  check (public_submission_limit >= 0),
  check (final_submission_limit >= 0),
  check (event_phase in ('not_started', 'practice_open', 'final_open', 'ended')),
  check (leaderboard_visibility in ('hidden', 'practice', 'final', 'ended', 'always'))
);

comment on table challenges is
  'Defines prompt engineering challenge configuration, including instructions, expected output schema, locked model, and submission limits.';
comment on column challenges.locked_model is
  'Legacy/configuration model metadata retained for challenge seeding and compatibility.';
comment on column challenges.evaluation_model is
  'Optional admin-selected OpenRouter model override. Null falls back to OPENROUTER_MODEL.';
comment on column challenges.event_phase is
  'Organizer-controlled event phase that gates participant workspace actions and submissions.';
comment on column challenges.leaderboard_visibility is
  'Organizer-controlled participant leaderboard visibility mode.';
comment on column challenges.event_announcement is
  'Short organizer announcement shown as plain text in the participant workspace.';
comment on column challenges.event_timer_ends_at is
  'Optional display-only organizer timer end time shown in the participant workspace.';
comment on column challenges.event_timer_label is
  'Optional short label for the display-only organizer timer.';

create table reports (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  external_id text not null,
  filename text,
  split report_split not null,
  report_text text not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, external_id),
  check (length(trim(external_id)) > 0),
  check (length(trim(report_text)) > 0)
);

comment on table reports is
  'Stores synthetic challenge reports and their sample/public/private split.';

create table answer_keys (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references reports(id) on delete cascade,
  acl_tear finding_value not null,
  mcl_injury finding_value not null,
  meniscus_tear finding_value not null,
  fracture finding_value not null,
  osteoarthritis finding_value not null,
  effusion finding_value not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table answer_keys is
  'Stores adjudicated structured labels for each report. This should be admin-only in production.';

create table prompt_runs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  run_type run_type not null,
  prompt_text text not null,
  model text not null,
  total_reports integer not null default 0,
  correct_fields integer not null default 0,
  total_fields integer not null default 0,
  field_accuracy numeric(6, 3) not null default 0,
  overall_score numeric(6, 3) not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(trim(prompt_text)) > 0),
  check (length(trim(model)) > 0),
  check (total_reports >= 0),
  check (correct_fields >= 0),
  check (total_fields >= 0),
  check (field_accuracy >= 0 and field_accuracy <= 100),
  check (overall_score >= 0 and overall_score <= 100)
);

comment on table prompt_runs is
  'Stores each prompt execution against sample, public, or final/private report sets.';

create table prompt_run_items (
  id uuid primary key default gen_random_uuid(),
  prompt_run_id uuid not null references prompt_runs(id) on delete cascade,
  report_id uuid not null references reports(id) on delete cascade,
  raw_model_output text,
  parsed_output jsonb,
  valid_json boolean not null default false,
  missing_fields text[] not null default '{}',
  invalid_fields jsonb not null default '[]'::jsonb,
  field_accuracy numeric(6, 3) not null default 0,
  overall_score numeric(6, 3) not null default 0,
  acl_tear finding_value,
  mcl_injury finding_value,
  meniscus_tear finding_value,
  fracture finding_value,
  osteoarthritis finding_value,
  effusion finding_value,
  error_message text,
  created_at timestamptz not null default now(),
  unique (prompt_run_id, report_id),
  check (field_accuracy >= 0 and field_accuracy <= 100),
  check (overall_score >= 0 and overall_score <= 100)
);

comment on table prompt_run_items is
  'Stores per-report model output and scoring details for a prompt run.';

create table submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  prompt_run_id uuid not null unique references prompt_runs(id) on delete cascade,
  submission_type submission_type not null,
  attempt_number integer not null,
  score numeric(6, 3) not null,
  correct_fields integer not null,
  total_fields integer not null,
  report_count integer not null,
  submitted_at timestamptz not null default now(),
  check (attempt_number > 0),
  check (score >= 0 and score <= 100),
  check (correct_fields >= 0),
  check (total_fields >= 0),
  check (report_count >= 0)
);

comment on table submissions is
  'Records public and final submissions. Final submissions power the leaderboard.';

create unique index submissions_one_final_per_participant_challenge
  on submissions (challenge_id, participant_id)
  where submission_type = 'final';

create unique index submissions_public_attempt_number_unique
  on submissions (challenge_id, participant_id, submission_type, attempt_number)
  where submission_type = 'public';

create index participants_role_idx on participants (role);
create index participants_access_code_idx on participants (access_code);
create index participants_active_idx on participants (is_active);
create index participant_attempt_overrides_updated_at_idx on participant_attempt_overrides (updated_at desc);
create index challenges_active_idx on challenges (is_active);
create index reports_challenge_split_idx on reports (challenge_id, split);
create index prompt_runs_participant_challenge_idx on prompt_runs (participant_id, challenge_id);
create index prompt_runs_run_type_idx on prompt_runs (run_type);
create index prompt_run_items_run_idx on prompt_run_items (prompt_run_id);
create index submissions_challenge_type_score_idx on submissions (challenge_id, submission_type, score desc);
create index submissions_participant_idx on submissions (participant_id);

-- Future RLS notes, intentionally not enabled here:
-- - Participants should read/write only their own prompt_runs, prompt_run_items, and submissions.
-- - Participants may read sample reports and limited public feedback, but not private answer keys.
-- - Admins should manage challenges, reports, answer_keys, and participant records.
-- - Final/private report texts and answer keys should be protected from participant direct access.
