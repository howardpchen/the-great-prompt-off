> **Historical document — not current setup instructions.** This records the earlier Supabase/Vercel design. Current runtime uses direct PostgreSQL; use [README.md](README.md), [db/README.md](db/README.md), and [deploy/README.md](deploy/README.md). Do not execute legacy SQL or seeding commands from this document.

# Supabase Migrations Guide

This guide explains the database SQL files for The Great Prompt-Off and what must be run in Supabase before production.

## What Supabase/Postgres Is

Supabase is the hosted Postgres database used by this app. Postgres stores the live workshop data that should survive page reloads and Vercel redeploys.

In this project, Supabase stores:

- challenges
- participants and access codes
- synthetic MRI reports
- hidden answer keys
- prompt runs
- per-report run items
- public/final submissions
- admin event settings, such as phase, leaderboard visibility, announcements, and timers

## What SQL Is

SQL is the language used to create, change, and query database tables.

Changing the Next.js app code does not automatically add new database columns or database functions. When the app needs a new database field, the matching SQL migration file must be run in the Supabase SQL Editor for the correct project.

Git rollback also does not undo Supabase database changes. Database changes live in Supabase until you intentionally alter them with SQL.

## Important Tables

- `challenges`: Stores challenge configuration, legacy model metadata, optional selected evaluation model, submission limits, active event phase, leaderboard visibility, live announcement, and display timer settings.
- `participants`: Stores participant identities, friendly codes such as `P001`, private access codes, roles, active/inactive state, display names, and email metadata.
- `reports`: Stores synthetic MRI report text and split values such as `public` and `private`.
- `answer_keys`: Stores the hidden structured labels for each report. This table must not be exposed to participants.
- `prompt_runs`: Stores one model evaluation run for a participant prompt.
- `prompt_run_items`: Stores per-report model outputs, parsed values, validation details, and scores for a prompt run.
- `submissions`: Stores counted Test Attempts and Final Submissions tied to prompt runs.

## Migration Files

Run these SQL files in the Supabase SQL Editor for the production Supabase project before the matching app code is deployed.

### `supabase/admin-atomic-clears.sql`

What it adds:

- `admin_reset_workshop_run_data()`
- `admin_clear_participant_run_data(target_participant_code text)`

Why it exists:

These RPC functions let the admin reset run/submission data in one database transaction instead of deleting from multiple tables one step at a time.

Required before production:

Yes. Admin reset and per-participant clear actions expect these RPC functions.

How to verify:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'admin_clear_participant_run_data',
  'admin_reset_workshop_run_data'
)
order by n.nspname, p.proname;
```

You should see both function names in the `public` schema.

### `supabase/event-controls.sql`

What it adds:

- `challenges.event_phase`
- A check constraint requiring one of:
  - `not_started`
  - `practice_open`
  - `final_open`
  - `ended`

Why it exists:

This lets the organizer control whether participants are waiting, practicing, submitting final entries, or finished.

Required before production:

Yes. Participant submission APIs and the admin dashboard expect `event_phase`.

How to verify:

```sql
select id, slug, title, event_phase, is_active
from challenges
where is_active = true;
```

### `supabase/leaderboard-visibility.sql`

What it adds:

- `challenges.leaderboard_visibility`
- A check constraint requiring one of:
  - `hidden`
  - `practice`
  - `final`
  - `ended`
  - `always`

Why it exists:

This lets the organizer choose when participants can see the leaderboard. Admin result pages remain visible to organizers.

Required before production:

Yes, if the deployed app includes leaderboard visibility controls.

How to verify:

```sql
select id, slug, title, leaderboard_visibility, is_active
from challenges
where is_active = true;
```

### `supabase/event-announcement.sql`

What it adds:

- `challenges.event_announcement`

Why it exists:

This stores a short admin-controlled live announcement banner shown to participants.

Required before production:

Yes, if the deployed app includes the live announcement panel.

How to verify:

```sql
select id, slug, title, event_announcement, is_active
from challenges
where is_active = true;
```

### `supabase/event-timer.sql`

What it adds:

- `challenges.event_timer_ends_at`
- `challenges.event_timer_label`

Why it exists:

This stores a display-only organizer countdown timer. The timer does not automatically change event phase or submission rules.

Required before production:

Yes, if the deployed app includes the event timer panel.

How to verify:

```sql
select id, slug, title, event_timer_label, event_timer_ends_at, is_active
from challenges
where is_active = true;
```

### `supabase/not-reported.sql`

What it adds:

- The `not_reported` value to the existing `finding_value` enum.

Why it exists:

This lets answer keys and stored structured outputs distinguish an explicitly absent finding from a finding that the report does not provide enough information to determine.

Required before production:

Yes, before deploying code that may score or store `not_reported` in Supabase. It does not rewrite existing answer keys.

How to verify:

```sql
select e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'finding_value'
order by e.enumsortorder;
```

Review existing answer keys separately. They remain unchanged until an organizer deliberately updates them to use `not_reported`.

### `supabase/evaluation-model.sql`

What it adds:

- Nullable `challenges.evaluation_model`
- A check that prevents a non-null model override from being blank

Why it exists:

This lets an admin choose the evaluation model for one active challenge without
changing environment variables or exposing provider credentials. A null value
falls back to `OPENROUTER_MODEL`. The admin API limits saved overrides to the
approved IDs in `app/lib/model-options.ts`; custom IDs are not accepted. The
approved list currently contains five live-tested options, with Gemini 2.5 Flash
recommended because it produced the clearest separation in calibration. Rerun
calibration after changing models or reports; the list may need retuning when
the planned 12-finding reports arrive.

Required before production:

Yes, before using the Evaluation model panel on `/admin`. The app continues to
use the environment fallback after this migration is installed and the field
is null.

How to verify:

```sql
select id, slug, evaluation_model, is_active
from challenges
where is_active = true;
```

The admin selector does not rewrite previous runs. Their stored model value
remains the model used for that run.

### `supabase/jsonb-schema-storage.sql`

What it adds:

- Transitional `mode_id` and `schema_version` metadata on `challenges`, `prompt_runs`, and `submissions`.
- `prompt_runs.schema_snapshot` for a future immutable schema snapshot.
- `answer_keys.answer_values` for generic answer-key JSON.
- `prompt_run_items.scored_values` for generic normalized prediction JSON.
- Basic positive-version and JSON-object checks.
- Indexes for mode and schema-version lookups.

Why it exists:

The current database stores six finding columns directly. This migration adds
future-compatible JSONB storage for twelve-field, shoulder, and later challenge
modes without changing the current runtime behavior.

Required before production:

Only when deploying the matching future storage work. It is not required for
the current app to score submissions, and it does not activate dormant modes.

Important transition rule:

The existing six-field columns remain in place for compatibility. The current
application dual-reads/dual-writes the JSONB values for the active six-field
mode, but the old columns must not be removed until the transition is complete
and verified.

The migration backfills current rows as `knee_mri_6_basic`, version `1`, and
stores the existing six-field values in JSONB. It does not re-score historical
model outputs.

Verification:

```sql
select id, slug, mode_id, schema_version, is_active
from challenges
order by created_at;
```

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'challenges',
    'answer_keys',
    'prompt_runs',
    'prompt_run_items',
    'submissions'
  )
  and column_name in (
    'mode_id',
    'schema_version',
    'schema_snapshot',
    'answer_values',
    'scored_values'
  )
order by table_name, column_name;
```

```sql
select count(*) as answer_keys_missing_json
from answer_keys
where answer_values is null;
```

```sql
select count(*) as prompt_runs_missing_schema_metadata
from prompt_runs
where mode_id is null
   or schema_version is null
   or schema_snapshot is null;
```

```sql
select count(*) as answer_key_mismatches
from answer_keys
where answer_values is distinct from jsonb_build_object(
  'acl_tear', acl_tear,
  'mcl_injury', mcl_injury,
  'meniscus_tear', meniscus_tear,
  'fracture', fracture,
  'osteoarthritis', osteoarthritis,
  'effusion', effusion
);
```

The expected mismatch count is zero for the current six-field data.

### `supabase/challenge-config-lock.sql`

What it adds:

- A database trigger that protects `evaluation_model`, `mode_id`,
  `schema_version`, and `output_schema` after the first successful submission
  for a challenge.

Why it exists:

Changing the model or output schema after scoring begins would make historical
scores difficult to compare. The server-side admin model route also performs a
friendly preflight check, while the trigger prevents races and protects future
configuration routes.

Failed or incomplete `prompt_runs` and admin calibration calls do not create
`submissions` rows, so they do not lock the challenge. The existing full reset
deletes submissions and run data; after an intentional reset, configuration can
be changed again before the next event.

Required before live configuration changes:

- Run this migration in the same Supabase project as the app.
- Do not edit protected configuration after successful submissions unless you
  intentionally reset the workshop data first.

Verify the trigger exists:

```sql
select tgname
from pg_trigger
where tgrelid = 'public.challenges'::regclass
  and not tgisinternal;
```

### `supabase/versioned-answer-keys.sql`

What it adds:

- `answer_keys.mode_id`
- `answer_keys.schema_version`
- A JSON-object check for `answer_values`
- Positive schema-version validation
- A composite unique constraint on `(report_id, mode_id, schema_version)`
- An index on `(mode_id, schema_version)`

Existing answer-key rows are backfilled as `knee_mri_6_basic`, version `1`.
The legacy columns (`acl_tear`, `mcl_injury`, `meniscus_tear`, `fracture`,
`osteoarthritis`, and `effusion`) remain in place. This migration does not
activate `knee_mri_12_basic`; dormant-mode answer-key imports remain admin-only
and do not change the activation allowlist.

The original PostgreSQL-generated single-report constraint,
`answer_keys_report_id_key`, is dropped only if that exact constraint name
exists. The new composite constraint allows one answer key per report per
mode/version while preserving existing six-field compatibility.

Verify the migration:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'answer_keys'
  and column_name in ('mode_id', 'schema_version', 'answer_values')
order by column_name;
```

```sql
select mode_id, schema_version, count(*)
from answer_keys
group by mode_id, schema_version
order by mode_id, schema_version;
```

```sql
select count(*) as missing_mode_version
from answer_keys
where mode_id is null or schema_version is null;
```

```sql
select count(*) as missing_answer_values
from answer_keys
where answer_values is null;
```

```sql
select report_id, mode_id, schema_version, count(*)
from answer_keys
group by report_id, mode_id, schema_version
having count(*) > 1;
```

### `supabase/future-mode-answer-keys.sql`

Run this after `supabase/versioned-answer-keys.sql` before importing dormant
mode answer keys. It removes the legacy six columns' table-level `NOT NULL`
requirements so a mode with a different field set can store a JSONB-only row.
It then adds a compatibility check requiring all six legacy values on every
`knee_mri_6_basic` version `1` row.

The migration is additive and does not activate a dormant mode, overwrite an
answer key, or remove a legacy column. Twelve-field imports remain versioned
by `(report_id, mode_id, schema_version)`.

Verify legacy compatibility and future-mode storage readiness:

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'answer_keys'
  and column_name in (
    'acl_tear',
    'mcl_injury',
    'meniscus_tear',
    'fracture',
    'osteoarthritis',
    'effusion'
  )
order by ordinal_position;
```

```sql
select count(*) as invalid_six_field_compatibility_rows
from answer_keys
where mode_id = 'knee_mri_6_basic'
  and schema_version = 1
  and (
    acl_tear is null
    or mcl_injury is null
    or meniscus_tear is null
    or fracture is null
    or osteoarthritis is null
    or effusion is null
  );
```

```sql
select mode_id, schema_version, count(*)
from answer_keys
group by mode_id, schema_version
order by mode_id, schema_version;
```

### `supabase/answer-key-provenance.sql`

What it adds:

- `answer_keys.provenance`
- `answer_keys.import_batch_id`
- `answer_keys.adjudicated_by`
- `answer_keys.adjudicated_at`
- `answer_keys.notes` when an older installation does not already have it
- Allowed-provenance and clinician-adjudication checks
- Indexes for mode/version/provenance and import-batch lookup

Why it exists:

Structurally valid staging labels must not be mistaken for clinician-reviewed
truth. The migration backfills existing `knee_mri_6_basic` version `1` rows as
`legacy`; other rows without metadata become `unknown`. New staging imports are
stored as `staging_demo`, while reviewed batches may be marked
`clinician_adjudicated` with an admin-only adjudicator and timestamp.

The admin readiness dashboard uses aggregate provenance counts. A complete
`knee_mri_12_basic` staging batch remains non-ready for clinical activation;
complete version-matched clinician-adjudicated coverage is required. These
fields and answer values are never participant-facing.

Apply this after `supabase/versioned-answer-keys.sql` and
`supabase/future-mode-answer-keys.sql`.

Verify the columns and types:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'answer_keys'
  and column_name in (
    'provenance',
    'import_batch_id',
    'adjudicated_by',
    'adjudicated_at',
    'notes'
  )
order by column_name;
```

Verify the six-field backfill and aggregate provenance:

```sql
select mode_id, schema_version, provenance, count(*)
from answer_keys
group by mode_id, schema_version, provenance
order by mode_id, schema_version, provenance;
```

```sql
select count(*) as six_field_rows_without_legacy_provenance
from answer_keys
where mode_id = 'knee_mri_6_basic'
  and schema_version = 1
  and provenance <> 'legacy';
```

Verify clinician-adjudicated rows have review metadata without displaying the
identity itself:

```sql
select count(*) as incomplete_clinician_metadata
from answer_keys
where provenance = 'clinician_adjudicated'
  and (adjudicated_by is null or adjudicated_at is null);
```

### `supabase/simulation-storage.sql`

What it adds:

- `simulation_batches`
- `simulation_runs`
- `simulation_run_items`
- `admin_delete_simulation_batch(target_batch_id uuid)`
- `admin_clear_simulation_data(target_challenge_id uuid)`

Why it exists:

Simulation history needs to remain completely separate from real participants,
attempts, prompt runs, submissions, leaderboards, configuration locking, and
event analytics. Deleting a simulation batch cascades only through its own
simulation runs and items.

Security:

The tables have RLS enabled and explicitly revoke access from `public`, `anon`,
and `authenticated`. The tables and cleanup functions are granted only to the
Supabase `service_role`. Any future application route calling these functions
must also enforce the existing admin session server-side.

Required before production:

Only before deploying a future phase that persists simulation results. Phase
9B deterministic dry-runs remain read-only and do not use these tables.

Score convention:

Simulation scores use the same `0` to `100` percentage scale as real stored
submission scores.

How to verify:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'simulation_batches',
    'simulation_runs',
    'simulation_run_items'
  )
order by table_name;

select
  (select count(*) from simulation_batches) as simulation_batches,
  (select count(*) from simulation_runs) as simulation_runs,
  (select count(*) from simulation_run_items) as simulation_run_items;

select
  (select count(*) from prompt_runs) as prompt_runs,
  (select count(*) from prompt_run_items) as prompt_run_items,
  (select count(*) from submissions) as submissions;

select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_delete_simulation_batch',
    'admin_clear_simulation_data'
  )
order by p.proname;
```

### `supabase/simulation-reference-batches.sql`

What it adds:

- `simulation_batches.is_reference`
- Optional `simulation_batches.reference_label` and `reference_notes`
- One-reference-per-challenge and completed-deterministic eligibility checks
- `admin_set_simulation_reference(...)`
- `admin_clear_simulation_reference(...)`

Why it exists:

This migration lets organizers use one completed deterministic simulation batch
as a regression reference. It modifies only `simulation_batches`; replacing or
clearing a reference does not write to real participants, prompt runs,
submissions, attempts, leaderboards, or event analytics.

Required before production:

Yes, before using reference controls on `/admin/simulations`. Apply
`supabase/simulation-storage.sql` first.

How to verify:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'simulation_batches'
  and column_name in ('is_reference', 'reference_label', 'reference_notes')
order by column_name;

select challenge_id, count(*) as reference_count
from simulation_batches
where is_reference = true
group by challenge_id
having count(*) > 1;

select id, challenge_id, status, evaluator_type, reference_label
from simulation_batches
where is_reference = true;

select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_set_simulation_reference',
    'admin_clear_simulation_reference'
  )
order by p.proname;
```

## Event-Control Columns on `challenges`

### `event_phase`

Controls participant workspace behavior and server-side submission gates.

- `not_started`: login allowed, public reports hidden, submissions closed.
- `practice_open`: Test Attempts open, Final Submission closed.
- `final_open`: Final Submission open, Test Attempts closed.
- `ended`: all submissions closed.

### `leaderboard_visibility`

Controls participant leaderboard visibility.

- `hidden`: participants never see the leaderboard.
- `practice`: visible only during `practice_open`.
- `final`: visible during `final_open` and `ended`.
- `ended`: visible only during `ended`.
- `always`: always visible.

### `event_announcement`

Short plain-text organizer message shown in the participant workspace. Empty string means no announcement.

### `event_timer_label`

Optional plain-text label for the display-only countdown timer.

### `event_timer_ends_at`

Timestamp for when the display-only countdown ends. `null` means no active timer.

## Reset RPC Functions

### `admin_reset_workshop_run_data()`

Deletes:

- `prompt_run_items`
- `submissions`
- `prompt_runs`
- `participant_attempt_overrides`

Preserves:

- `participants`
- access codes
- `reports`
- `answer_keys`
- `challenges`
- admin event settings

### `admin_clear_participant_run_data(target_participant_code text)`

Deletes the same run/submission data and Test Attempt override, but only for one participant.

Preserves:

- the participant row
- the participant access code
- reports
- answer keys
- challenges
- other participants' runs and submissions
- other participants' Test Attempt overrides

These RPC functions are safer than app-side deletes because the related deletes happen inside the database. That reduces the chance of a partial reset where one table is cleared but a later table fails.

## Production Setup Checklist

- Run all required SQL migration files in the production Supabase SQL Editor:
  - `supabase/schema.sql` for a fresh database, or the incremental migration files for an existing database.
  - `supabase/access-code-migration.sql` for databases created before the current access-code format.
  - `supabase/admin-v1-5-migration.sql` for databases missing participant email/active fields.
  - `supabase/participant-attempt-overrides.sql`
  - `supabase/admin-atomic-clears.sql`
  - `supabase/event-controls.sql`
  - `supabase/leaderboard-visibility.sql`
  - `supabase/event-announcement.sql`
  - `supabase/event-timer.sql`
  - `supabase/not-reported.sql`
  - `supabase/evaluation-model.sql`
  - `supabase/jsonb-schema-storage.sql`
  - `supabase/versioned-answer-keys.sql`
  - `supabase/future-mode-answer-keys.sql` before writing dormant-mode answer keys
  - `supabase/answer-key-provenance.sql` before using provenance-aware imports/readiness
  - `supabase/challenge-schema-update.sql` before using guarded schema updates
  - `supabase/simulation-storage.sql` before persisting deterministic simulation results
  - `supabase/simulation-reference-batches.sql` before using simulation reference baselines
- Run `npm run seed:supabase` with production Supabase environment variables.
- Verify the active challenge has `evaluation_model`, `event_phase`, `leaderboard_visibility`, `event_announcement`, `event_timer_label`, and `event_timer_ends_at`.
- Verify reset RPC functions exist and were updated from `supabase/admin-atomic-clears.sql`.
- Verify report counts.
- Verify answer-key coverage.
- Verify participants and access codes.
- Verify run/submission counts are `0` before the real event.

## Verification SQL

Active challenge and event settings:

```sql
select id, slug, title, event_phase, leaderboard_visibility, event_announcement, event_timer_label, event_timer_ends_at, is_active
from challenges
where is_active = true;
```

All columns on `challenges`:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'challenges'
order by ordinal_position;
```

Reset RPC functions:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'admin_clear_participant_run_data',
  'admin_reset_workshop_run_data'
)
order by n.nspname, p.proname;
```

Report split counts:

```sql
select split, count(*)
from reports
group by split
order by split;
```

Answer-key coverage:

```sql
select
  count(*) as total_reports,
  count(answer_keys.id) as reports_with_answer_keys,
  count(*) - count(answer_keys.id) as reports_missing_answer_keys
from reports
left join answer_keys on answer_keys.report_id = reports.id;
```

Participants and access codes:

```sql
select
  count(*) as total_participants,
  count(access_code) as participants_with_access_codes,
  count(distinct access_code) as unique_access_codes
from participants;
```

Run/submission counts before the event:

```sql
select
  (select count(*) from prompt_runs) as prompt_runs,
  (select count(*) from prompt_run_items) as prompt_run_items,
  (select count(*) from submissions) as submissions;
```

## Warnings

- Do not run reset during the event unless you intentionally want to clear Test Attempts, Final Submissions, leaderboard results, run history, and extra Test Attempt grants.
- Do not expose `answer_keys` to participants.
- Do not edit private reports during live submissions unless absolutely necessary.
- SQL changes affect the live Supabase database.
- Git rollback does not undo Supabase database changes.
- Run SQL in the correct Supabase project. It is easy to update a staging database while production remains unchanged, or vice versa.
