# Contest Library

Multiple contests are retained; at most one is active. Creating or duplicating a contest **does not activate it**.

## Organizer workflow

1. Select a contest in **Contest Library**. Selection only changes the library editor.
2. Create an empty inactive draft from the selected configuration, giving an explicit title, fixed model and equal practice budget; or duplicate selected configuration/reports (answers and histories are not copied).
3. Edit fields/baseline/settings while inactive. Save schema changes as a new version.
4. Import a JSON array of reports into the empty draft: `external_id`, `filename`, `split` (`public` or `private`), `report_text`. Both splits are required. Identifiers and filenames must be unique within the contest. The importer never deletes or replaces existing reports.
5. Import the complete answer array using the existing `report_id_or_filename` / `answer_values` format. All labels must exactly match the schema. Explicit `not_mentioned` is a clinical string, never null or abstention. Any invalid or missing answer rolls back the complete answer import.
6. Review reference provenance and approval independently. Structural readiness does not establish clinical truth.
7. Explicitly activate a ready contest. Switching is atomic and rejected while evaluations are pending. Submissions begin paused; revealing a completed contest is irreversible and remains revealed if reselected.
8. Open practice separately in the active contest controls. The other organizer pages are explicitly active-only; stale organizer mutations are rejected against their rendered contest ID/version.
9. Archive an inactive contest without deleting history. Activate another contest before archiving the current one. Archived drafts cannot be edited, but may be duplicated or reactivated.

## Isolation and API contracts

`GET /api/admin/contests` lists contests; `POST` supports `create`, `settings`, `activate`, `archive`. Existing `GET /api/admin/contest-schema?contestId=...` and its POST operations target the selected contest. Both endpoints require organizer authentication and same-origin writes.

Mutations require explicit contest ID, expected schema version, and expected management revision returned by the schema read (except creation). Concurrent stale saves return an error, not silent last-write wins. The library exposes the most recent 200 submission summaries for the selected contest to organizers only.

Legacy organizer POST routes require `X-Contest-Id` and `X-Contest-Version` from the rendered organizer console. Their complete handlers share the same transaction as the active-contest check, so a concurrent switch cannot retarget an action. Failure responses roll back rather than committing partial work. Clients/scripts written before this feature must reload context and send these headers.

Participant POSTs require `contestId` and `schemaVersion` in addition to session/prompt fields. An old tab is rejected instead of submitting its prompt to a different contest. Admission and activation share one transaction advisory lock; a unique partial index independently enforces the one-active invariant.

Team accounts/access codes remain global identities. Attempts, grants, saved instructions, reference answers, results, and final locks are contest-scoped. Historical legacy grants migrate only to the previously active contest; a migration with grants but no active contest deliberately fails for operator reconciliation. No clinician-review status is inferred by import.

## Local verification

- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `npm run test:contest-library` requires disposable migrated/demo-seeded `gpo_library_test`; it exercises synthetic 100 x 12 import, rollback, active/admission races, stale versions, and history/account isolation.
- `tests/e2e/contest-library.pw.ts` tests creation/import/explicit activation in the production browser build; all content is synthetic.
- `scripts/prepare-library-upgrade-fixture.ts` creates pre-library migrations 001–025 only in disposable `gpo_library_upgrade`; dump/restore it before applying new migrations to test upgrade preservation.

No report text, clinical evidence or reference dataset belongs in public Git. Publishing code, deploying it, accepting the clinical references and activating the new contest are separate release gates.
