# Event operations checklist

Current storage is direct PostgreSQL, not Supabase. Use [README](README.md), [database setup](db/README.md), [deployment/recovery](deploy/README.md) and [report/reference guide](REPORT_IMPORT_GUIDE.md).

## Before an approved release

- [ ] Record running/source/image identities, existing overrides and private port bindings; preserve unrelated work and secrets.
- [ ] Run tests/lint/build and dependency audit on the exact release candidate. Browser/database mutation checks must use disposable fixtures.
- [ ] Verify no pending evaluator/Sandbox work before interrupting the app. Do not expire/replay a possibly paid call blindly.
- [ ] Back up, restore-test in isolation and compare data fingerprints. Retain prior source/image/configuration for rollback.
- [ ] Review migrations for compatibility. Never seed or reset as part of a code-only update.
- [ ] After cutover, verify effective image, liveness/readiness, authenticated read paths, preserved model/phase/limits/access controls, data parity and database uptime.

## Before opening a contest

- [ ] Confirm dataset permissions, provider suitability and independently reviewed references. Synthetic/deterministic success is not clinical acceptance.
- [ ] Inspect the active contest identity/version, field definitions/weights, reference coverage and report splits.
- [ ] Confirm budget, final limits, model, real/deterministic mode, provider capacity and recovery plan.
- [ ] Keep access-code exports private. Verify organizer and participant sessions with the intended origin and production cookie settings.
- [ ] Rehearse phase transitions, announcements, timer, leaderboard and projector visibility on a disposable copy.
- [ ] Obtain the separate authority needed for paid evaluation and event activation. A deployed feature is not an open event.

## During and after

- [ ] Monitor safe progress/queue telemetry and failures; do not paste report contents, raw outputs, credentials or participant identities into public channels.
- [ ] Treat pending attempts as possibly running. Confirm worker termination before an approved recovery; use a fresh reservation for a genuine retry.
- [ ] Reveal final aggregates only through the intended event phase. In educational contests, ending is an irreversible reveal.
- [ ] Store exports and backups outside code repositories with restricted access. Never reset or delete results merely to close an event.
- [ ] Document current source, settings, backup/restore evidence and known issues privately.
