# Short rehearsal checklist

Use a disposable synthetic contest, not a live event. See [full checklist](DEMO_CHECKLIST.md), [database setup](db/README.md) and [deployment/recovery](deploy/README.md).

- [ ] Identify exact source/image and database target; verify protected, independent secrets and trusted origin.
- [ ] Apply only `db/migrations` with the migrator; verify its checksum ledger. Seed only an empty synthetic database with explicit `SEED_DEMO=true`.
- [ ] Run unit/lint/build and production dependency audit. Check liveness and database readiness separately.
- [ ] Verify organizer login and an active participant session. Do not log access codes or hidden answers.
- [ ] Inspect configured schema, sample/public/private split counts, references, model, limits and phase; do not assume fixed README values.
- [ ] Exercise Sandbox, public practice, saved feedback/history and a final submission **only in the disposable fixture**.
- [ ] Verify no cross-participant history, private report text, held-out keys or raw final output is returned. Check phase-dependent aggregate hiding.
- [ ] Confirm contest edits/forking/activation and reset confirmations behave as documented without losing historical work.
- [ ] Verify display/leaderboard visibility and narrow-screen feedback navigation.
- [ ] Restore a backup into an isolated database and compare contents; retain rollback image/source before any approved release.

A successful synthetic rehearsal is not permission for production mutations, paid model calls, dataset import or contest activation.
