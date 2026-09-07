# Private deterministic release and recovery

## Release gate

This packaging is for a **private synthetic rehearsal** only. No DNS, Caddy,
public ports, paid evaluation, persistent restart policies or backup schedules
are activated here. Server changes are coordinator-only. Build on a sufficiently
sized machine rather than on the resource-constrained target. Latest coordinator
inventory verifies 1967 MiB RAM, x86_64 and approximately 6.8 GiB free disk. Minimum practical
starting point is 1 GiB RAM for a small rehearsal; 2 GiB gives useful headroom.
The current 2 GiB host meets that starting recommendation, but this is not a
measured 50-user capacity guarantee. Current Compose caps total
app/database memory at 640 MiB before host/daemon overhead.

Use maintained Docker Compose v2, PostgreSQL 17 and Node 22. Next standalone
follows the installed Next output/deploying documentation. Before deployment,
resolve `NODE_IMAGE` and `POSTGRES_IMAGE` to immutable approved digests; record
those, exact Git commit, architecture, image IDs, checksums and migration list
in the release manifest. `npm ci` enforces the committed dependency lock.
Default Node/PostgreSQL references are pinned to retrieved image digests; any
overrides must also be pinned and verified. Never build with secrets as Docker arguments.

## Disk and off-host release transfer

The 6.8 GiB available target disk is plausible for a small synthetic rehearsal
ONLY with off-host builds and bounded retention. Exact integrated images must
still be measured. Retrieved compressed image sizes are about 149 MiB PostgreSQL
and 76 MiB Node; expanded snapshots, tooling dependencies and previous images
consume additional space. Do not treat compressed sizes as installed usage.
Before transfer record `docker system df -v`, `df -h` and image archive sizes.
Budget for current and previous app, one tooling image, PostgreSQL, DB data,
one local backup and at least 2 GiB free operating headroom after installation.
If that headroom cannot be met, stop and obtain a storage/retention decision.

Build app/tooling on the local build machine and stream the reviewed archive
through the already authorized coordinator SSH channel into `docker load`;
verify image IDs after transfer. Streaming avoids retaining duplicate tar files.
Do not run full `npm ci`, browser installation or Docker builds on the target.
No global image/cache pruning: remove only identified obsolete release artifacts
after confirming the previous known-good release and backup remain recoverable.
Use Docker's bounded local logging driver below; database backups also need
explicit retention. No disk-growth monitor or persistent scheduler is activated.

## Protected inputs

Host-owned protected entry must materialize these files outside Git, in
`secrets/`: `db_owner_password`, `db_migrator_password`, `db_app_password`,
`admin_secret`, `participant_secret`. Use independent values; auth secrets
must each be at least 32 bytes. Never paste them into commands/chat, environment
files, URLs or build logs. Secret mounts are file-based, not Compose env values.
For plain Compose bind-backed secrets, ensure the container UIDs can read files
without making them world-readable: use host filesystem ACLs (app/tooling UID
1000, PostgreSQL image UID determined by `id postgres`) and a protected parent
directory. Compose `uid/gid/mode` is not enforced for file-backed secrets.
Store recoverable copies in the approved protected credential store.

## First empty-database release (coordinator, after host preparation)

Inspect existing containers, ports, mounts, resources and release files first.
Preserve existing state. Use a dedicated release directory and stable Compose
project name (`prompt-off-private`) so releases keep the same database volume.
All commands below run in that directory; do not use `down -v`.

```sh
docker compose config --quiet
docker compose build migrate app
docker compose up -d --wait db
docker compose run --rm migrate
# Explicit demo seed ONLY after confirming a fresh synthetic database:
docker compose run --rm -e SEED_DEMO=true -e EVENT_PHASE=practice_open migrate npm run seed:demo
docker compose up -d --wait app
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/health/ready
docker compose ps
```

For remote installation, transfer prebuilt immutable images instead of building
on the target. Set `APP_IMAGE` and `TOOLING_IMAGE` to reviewed release tags and
use `up --no-build`. The PostgreSQL service has no published port and lives on
an internal network with outbound access blocked. App runtime is unprivileged,
read-only with narrowly scoped tmpfs, capabilities dropped. Migration tooling
is a separate image and profile, not included in runtime. Database bootstrap
creates separate owner, migration and application roles; only the migrator owns
the schema. Migration/seed are explicit one-offs, never app startup actions.

Access through an SSH tunnel bound on the operator machine to loopback:

```sh
ssh -N -L 127.0.0.1:3000:127.0.0.1:3000 prompt-off
```

Open **http://localhost:3000**, matching `APP_ORIGIN`. Production cookies retain
Secure; verify localhost browser handling. Do not substitute a LAN IP or expose
port 3000 publicly. Changing trusted origin requires coordinated configuration
and another browser test. Readiness checks DB connectivity, not migration/data
correctness: verify participant and organizer workflows separately.

## Verification

```sh
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
npx playwright install chromium
```

`tests/e2e/rehearsal.pw.ts` uses an actual running app and seeded PostgreSQL;
it is not a mock browser test. On an isolated synthetic event, provide protected
file paths `ADMIN_SECRET_FILE` and `E2E_ACCESS_CODE_FILE`, plus
`E2E_ALLOW_MUTATIONS=true`, then run `npm run test:e2e`. Files contain the organizer
secret and one actual seeded participant code; do not log these. It validates
organizer login/cookie, phase control, participant browser login, deterministic
public submission, phase-gated final submission, repeat-final UI restriction,
and projector rendering. Traces/screenshots/video are off to avoid credential
or hidden-answer capture. Never run against a real event: it changes event phase
and consumes attempts. Record test output without request payloads.

CI checks lint, units, production audit/build, then `deploy/ci-rehearsal.sh`
builds and launches actual containers, migrates/seeds an isolated fixture, runs
the browser rehearsal and populated backup/restore mechanics. The script refuses
existing secret directories and non-CI environments; credentials are generated
directly to protected files. No logs/traces or backups are uploaded as artifacts.
Full integration evidence must be collected, not inferred from harness presence. Before 50-user use,
measure simultaneous bursts, memory, pool saturation, failure recovery and
attempt accounting. Deterministic success is not live-model readiness.

## Backup and restore

`bash deploy/backup.sh` creates a restricted custom-format logical backup with
checksum. It uses the local database socket, without credential arguments.
Copy backups to an independently protected destination only after that target
is authorized; the host volume alone is not hardware-loss recovery. Agree RPO,
RTO, retention and destination before enabling any scheduled backup. Save the
release manifest, role bootstrap SQL, migrations and protected credential refs
separately from the database. Logical backup excludes role definitions/secrets.

`bash deploy/restore-check.sh backups/FILE.dump` verifies checksum, restores into
a newly named isolated database and checks table presence. It deliberately
retains the restored DB for application-level row-count, login, leaderboard and
submission checks. It never overwrites or drops the active database. Record
backup time, restored row counts and measured recovery duration; a table count
alone does not satisfy the final recovery gate. For full recovery, bootstrap
roles on a fresh cluster, restore with preserved ownership/permissions and
compare migration ledger before starting the matching application image.

## Upgrade and rollback

1. Capture prior commit/image IDs, resolved Compose config (file paths only),
   schema/migration ledger and database backup; verify backup before migration.
2. Stop app only (`docker compose stop app`); keep DB and volume intact.
3. Run reviewed migrations using the matching tooling image. Do not seed.
4. Start exact new app image and verify health/readiness and controlled flows.
5. If app-only regression and schema explicitly backward-compatible, set
   `APP_IMAGE` to the prior immutable image and recreate app with `--no-build`.
6. If schema incompatible, keep writes stopped. Restore pre-migration backup
   into a new database/volume, start matching prior app against it and verify
   before switching. Never claim reverting a container reverts schema/data.

Restore may discard post-backup writes; approval and recovery expectations must
be explicit before any live-data replacement. Keep failed release artifacts and
original volume recoverable. No automatic destructive rollback is provided.
