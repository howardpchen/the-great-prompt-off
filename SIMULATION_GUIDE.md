> Current storage is direct PostgreSQL. Apply only ordered `db/migrations` with `npm run db:migrate`; historical `supabase/*.sql` references below identify provenance, not commands to run. See [database setup](db/README.md).

# Simulation Rehearsal

## Phase 9B: Deterministic Dry-Run

The admin-only endpoint `POST /api/admin/simulations/dry-run` rehearses schema-driven scoring with fixed synthetic simulation profiles.

This phase is intentionally limited:

- It is deterministic mock output, not a real LLM benchmark.
- It makes no OpenRouter calls.
- It writes no database rows.
- It creates no participants, attempts, prompt runs, submissions, or leaderboard entries.
- It does not activate or allowlist dormant challenge modes.

The endpoint defaults to public reports. Admins may explicitly request `public`, `private`, or `all`, but the response contains aggregate scores and diagnostics only. It never returns report text, answer-key values, hidden instructions, or raw model output.

Example request body:

```json
{
  "modeId": "knee_mri_6_basic",
  "schemaVersion": 1,
  "reportScope": "public",
  "profileIds": [
    "blank",
    "nonsense",
    "vague",
    "partial_first_field",
    "basic_all_fields",
    "strong_all_fields"
  ]
}
```

Dormant modes such as `knee_mri_12_basic` can be dry-run only when matching versioned answer keys exist for the requested reports. A dry-run does not imply that provenance requirements or activation readiness have passed.

Future phases may add optional real-model rehearsal and deeper simulation-only
analytics. Those features should remain separate from real event storage.

## Phase 9C: Isolated Storage

`supabase/simulation-storage.sql` adds three dedicated tables for future
persistent simulations:

- `simulation_batches`
- `simulation_runs`
- `simulation_run_items`

These tables have no relationship to real participants, attempts, prompt runs,
submissions, leaderboards, event locks, or event analytics. They intentionally
contain no answer-key values, report text, or raw model-output column.

The migration also adds two service-role-only cleanup functions:

- `admin_delete_simulation_batch(target_batch_id uuid)` deletes one batch and
  cascades to its simulation runs and items.
- `admin_clear_simulation_data(target_challenge_id uuid)` deletes all
  simulation batches for one challenge and cascades to their runs and items.

Future API routes must require an admin session before calling either RPC.
Participant and anonymous database roles have no direct simulation-table or
cleanup-function access.

Phase 9B dry-runs still do not write to these tables.

## Phase 9D: Persistent Deterministic Simulations

The following admin-only endpoints use the isolated simulation tables:

- `POST /api/admin/simulations/run` runs and saves a deterministic simulation.
- `GET /api/admin/simulations` lists the 25 most recent batches for the active challenge.
- `GET /api/admin/simulations/{batchId}` returns one batch and safe per-profile aggregates.
- `DELETE /api/admin/simulations/{batchId}` deletes one batch after the request confirms the batch ID.
- `DELETE /api/admin/simulations` clears simulation data for the active challenge after confirming `CLEAR SIMULATIONS`.

The persistent run endpoint accepts the same `modeId`, `schemaVersion`,
`reportScope`, and `profileIds` payload as the dry-run endpoint. It writes:

- one `simulation_batches` row
- one `simulation_runs` row per selected profile
- one `simulation_run_items` row per profile/report evaluation

Writes are isolated from real event storage. If a run or item write fails after
the batch is created, the server calls `admin_delete_simulation_batch` to clean
up the partial batch. It does not write participants, attempts, real prompt
runs, submissions, or leaderboard data.

Responses and retrieval endpoints contain aggregate batch/profile metadata
only. They do not return answer-key values, report text, strategy snapshots,
per-report scored values, hidden instructions, or raw model output.

Persistent simulation remains deterministic mock evaluation. It makes no
OpenRouter calls and must not be interpreted as a real model benchmark.

## Phase 9E: Admin Simulation Dashboard

Authenticated organizers can open `/admin/simulations` to run deterministic
simulation batches, inspect recent aggregate results, delete one batch, or clear
all simulation data for the active challenge. The run form uses only the admin
simulation endpoints and sends `modeId`, `schemaVersion`, `reportScope`, and
selected built-in `profileIds`.

Dormant modes are labeled rehearsal-only. Running a simulation does not activate
or allowlist a mode. The dashboard displays batch and per-profile aggregates but
does not display report text, answer-key values, strategy snapshots, per-report
predictions, raw model output, or participant data.

Deleting one batch requires its batch ID. Clearing all simulation data requires
the exact confirmation text `CLEAR SIMULATIONS`. Both actions operate only on
the isolated simulation tables.

## Phase 9F: Simulation-Only Analytics

The `/admin/simulations` dashboard also loads aggregate deterministic trends
from two admin-only endpoints:

- `GET /api/admin/simulations/analytics`
- `GET /api/admin/simulations/compare?leftBatchId=...&rightBatchId=...`

Analytics use completed rows from `simulation_batches` and `simulation_runs`
only. They show batch history, average score by profile/mode/report scope, JSON
validity, missing and invalid diagnostics, profile rankings, and strategy
separation. Weak strategy separation uses the blank, nonsense, and vague
profiles; strong separation uses the basic and strong all-fields profiles. The
partial-field profile is excluded from that comparison.

The comparison tool accepts two completed batches belonging to the active
challenge and reports right-minus-left score and diagnostic deltas. Neither
endpoint reads real participants, prompt runs, submissions, attempts, or real
analytics. Responses exclude answer values, report text, strategy snapshots,
per-report predictions, private contents, hidden prompts, and raw outputs.

## Phase 9G: Aggregate CSV Export and Reproducibility

Authenticated organizers can export safe per-profile aggregates from:

- `GET /api/admin/simulations/export` for the 100 most recent completed batches.
- `GET /api/admin/simulations/export?batchId={uuid}` for one completed batch.

The CSV contains batch timing, mode/version, evaluator, report scope/count,
field count, profile identity/version/label, score totals, JSON validity, and
missing/invalid diagnostics. Cells use the shared formula-injection-safe CSV
encoder. The export does not include report-level items, answer values, report
text, private contents, strategies, hidden prompts, raw outputs, participant
data, or secrets.

Opening a batch detail also shows a reproducibility summary with its mode and
schema version, evaluator, report scope, selected profile IDs/versions, counts,
and deterministic/synthetic disclaimer. The stored schema snapshot remains
server-only; the UI receives a canonical SHA-256 hash so organizers can compare
contracts without receiving the snapshot payload.

## Phase 9H: Reference Batches and Regression Checks

Run `supabase/simulation-reference-batches.sql` before using reference
baselines. The additive migration stores reference metadata only on
`simulation_batches` and adds service-role-only RPCs for setting or clearing a
reference. Each challenge can have at most one reference, and only a completed
`deterministic_mock` batch is eligible. Replacing a reference clears the old
reference metadata atomically.

On `/admin/simulations`, an organizer can mark a completed batch as the current
reference, clear it with confirmation, and compare recent completed batches to
it. Comparisons use candidate-minus-reference deltas for each profile and for
aggregate JSON validity, missing fields, and invalid values. Warnings appear
when:

- the average or a profile score changes by more than 5 percentage points;
- JSON validity decreases;
- missing fields increase;
- invalid values increase; or
- the mode, schema version, report scope, or profile set does not match.

These checks are deterministic simulation regression signals, not clinical
validation. They do not affect challenge configuration, real submissions,
leaderboards, attempts, event progress, or real analytics. Responses and the UI
remain aggregate-only and do not include report text, answer values, strategies,
raw outputs, or participant data.

### Manual Verification

```sql
-- Confirm the isolated tables exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'simulation_batches',
    'simulation_runs',
    'simulation_run_items'
  )
order by table_name;

-- Simulation rows should remain zero until a later persistence phase.
select
  (select count(*) from simulation_batches) as simulation_batches,
  (select count(*) from simulation_runs) as simulation_runs,
  (select count(*) from simulation_run_items) as simulation_run_items;

-- Applying this migration or running Phase 9B must not create real event rows.
select
  (select count(*) from prompt_runs) as prompt_runs,
  (select count(*) from prompt_run_items) as prompt_run_items,
  (select count(*) from submissions) as submissions;

-- Confirm both simulation-only cleanup RPCs exist.
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
