# Reports and reference answers

The live source of truth is PostgreSQL. No Supabase project, browser key or SQL Editor is required. [db/README.md](db/README.md) explains roles/migrations; only `db/migrations/` is executable migration authority.

## Fresh synthetic development database

`scripts/seed-demo.ts` reads `data/mock-report-manifest.json`, `data/mock-answer-keys.json` and `seed-data/mock-reports/`. After migrations, `SEED_DEMO=true npm run seed:demo` seeds an **empty** synthetic database transactionally and refuses an existing challenge. It is not an upsert/import tool for a populated event. Codes are randomized and must be exported privately.

Do not put report files in `public/` or change shared synthetic fixtures into a real event's dataset. Reports, annotations, configurations, submissions and imports/exports remain outside the application repository.

## Organizer-managed contests

1. Select or create the intended contest. Define fields, exact labels, units, nullability, tolerances and weights using the authenticated schema editor. Persisted contest definitions, not old six-field examples, drive scoring.
2. Use `/admin/cases` for report and active-reference management. For bulk dataset operations not supported by that interface, prepare a separately reviewed operator import; do not substitute the demo seed or legacy scripts.
3. Use the contest editor's **Validate and import all answers** with a protected JSON payload. The shape is `{"report_id_or_filename":"synthetic-practice.txt","answer_values":{"finding":"present","length":12.5}}`; use exactly the selected schema's keys and types. See [configurable contests](docs/configurable-contests.md).
4. Cover all required practice and held-out reports once. Reject unknown/ambiguous IDs, duplicate entries, invalid values and incomplete coverage. A same-version clinically adjudicated reference cannot be silently downgraded.
5. Verify readiness and provenance before opening submissions. Structural validity does not establish clinical correctness or rights to send report text to an inference provider.
6. Once admitted work freezes contents, create a new contest/version for changes instead of editing frozen references or discarding old scores. Check the specific fork mode's copy behavior in [contest library](docs/contest-library.md).

Never join keys only by report ID: include the relevant mode/schema version. Never expose held-out keys or reports through participant responses; public-feedback comparisons follow the separate practice policy. Preserve old runs' schema snapshots for later analysis.

## Verification

On a disposable copy, check report counts/splits, unique external identifiers, exact reference coverage, missing/invalid fields, source provenance, active version and frozen-state enforcement. Run the guarded contest-schema/import regressions. Keep data-level evidence private, back up before changes and never infer import success solely from an issued command.

Historical files under `supabase/` remain for source/history regressions. Do not execute them as the current import or migration workflow.
