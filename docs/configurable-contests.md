# Configurable contests

The organizer's **Contest fields and answer keys** editor defines 1–64 fields. Each has a stable key, label, optional instructions and a positive weight (default 1).

- Binary: exactly two distinct string labels (e.g. `"0"`/`"1"` or `"absent"`/`"present"`). Booleans and numeric CSV labels are not automatically converted.
- Multiclass: 2–50 distinct string labels; typed classification output uses exact labels.
- Measurement: a finite JSON number in a fixed unit, optional inclusive min/max, and nonnegative inclusive absolute tolerance. Numeric strings and unit-bearing text are invalid.

All keys are required. `nullable` permits explicit JSON null for missing/uncertain evidence, not an omitted key. Null never means zero. A valid null reference matches only a valid explicit null prediction. Each correct classification or in-tolerance measurement earns its weight, otherwise zero. The score is 100 × earned weight / total weight. Aggregate scores average report scores; unweighted correct-field counts are diagnostic only.

## Organizer workflow

1. Use the existing schema, twelve-binary template, or mixed 5/5/2 template. Customize fields and **Save schema as new draft version**. This increments the version, generates a contest-specific identity, closes submissions and invalidates answer readiness. Old key rows remain; they are not reused for a different version.
2. Prepare practice and held-out reports in Case Manager. Both splits must exist. Report edits invalidate readiness for configurable contests.
3. Import JSON with **Validate and import all answers**. Entries use `{"report_id_or_filename":"practice-001.txt","answer_values":{"injury":"present","diameter":12.5}}`, with exactly your schema's keys. Cover every practice/held-out report once. Unknown/ambiguous IDs, duplicates, invalid values or incomplete coverage roll back the whole import. This editor imports JSON; convert CSV values deliberately without treating missing labels as negative findings.
4. Structural readiness is not clinical adjudication or permission to use a dataset. Independently review reference answers and dataset/privacy restrictions. Same-version clinician-adjudicated keys cannot be downgraded by this import.
5. Open submissions when ready. PostgreSQL independently rejects an unready contest. The first admitted attempt freezes the schema and report/answer contents, even if evaluation fails. Resetting runs does not unlock it.
6. **Create new contest version (preserve old scores)** copies reports into a new active draft, deactivates the old contest, and preserves old submissions/run schema snapshots. It does not copy answers or scores. Reimport answers for the new contest. Participants/access codes remain available; attempt grants are still participant-global.

The persisted schema drives participant instructions/output contract, answer validation, model parsing, weighted scoring, admin editing and readiness. Six-field templates retain original identities, labels, aliases, normalization and scores. The new binary template does not redefine the dormant four-label twelve-field template. Its source column labels reflect RSNA header names; no reports or dataset answers are included in source control.

## Boundaries

Admin authentication and same-origin controls protect edits. Definitions are bounded data, not executable code. Schema/import/admission serialize on a database row. Public metadata is allowlisted; held-out answers remain server-side. Units are fixed per field, with no unit conversion or distance-based partial credit. Deterministic scoring validates mechanics, not clinical model performance.

Forking preserves archived data in PostgreSQL; a full archive-browser UI is not included. Back up before applying additive migration 022. Once custom contests exist, roll forward rather than running the old static-mode runtime against them. No external provider calls or deployment were performed for this change.

## Tests

Run unit/lint/build checks and the existing database regression. `npm run test:contest-schema` requires a freshly migrated/seeded disposable **gpo_schema_test** database and real evaluation disabled. It tests twelve-binary/mixed submissions, atomic imports, readiness, lock enforcement, numeric editing and preserved history. The browser test `tests/e2e/contest-schema.pw.ts` uses the resulting mixed synthetic contest, protected fixture credential files, and `E2E_ALLOW_MUTATIONS=true`. Never point these mutating tests at a live event.
