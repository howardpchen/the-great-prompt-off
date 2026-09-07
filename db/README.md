# Direct PostgreSQL rehearsal storage

Application data uses `pg`, a bounded server-only pool and parameterized SQL. No Supabase API or credentials are required. Existing `app/lib/supabase` module paths and response `source: "supabase"` strings are retained solely for UI/backward compatibility; they do not identify the transport. Browser DB helper is removed.

Set server-only `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD_FILE` (a protected mounted password file). `DATABASE_URL` is accepted for compatible hosting, but do not put credentials in command arguments or transcripts. `PGPOOL_MAX` defaults to 10, maximum 50. Connection timeout is 5 seconds and statement timeout 30 seconds. No TLS setting is silently disabled.

## Bootstrap

Provision separate schema-owning migrator and DML-only application roles. The deployment bootstrap owns role provisioning and the pgcrypto extension. The app requires table SELECT/INSERT/UPDATE/DELETE, sequence USAGE and execution of application-owned SQL functions, not CREATE or superuser. Database networking is private. SQL functions use SECURITY INVOKER; PUBLIC function execution is revoked. There is no browser/public database role.

1. As migrator, `npm run db:migrate` applies ordered SQL files, records SHA-256 checksums in `schema_migrations`, and serializes runners with an advisory lock. Each migration commits separately; a failed migration rolls back and remains unapplied. Applied files are immutable; use a new numbered migration.
2. Only for a **new synthetic event**, set `SEED_DEMO=true`, optionally `EVENT_PHASE=practice_open`, then run `npm run seed:demo`. Seed is one transaction and refuses any existing challenge. It never runs as part of application startup or migrations. Access codes are randomized and must be exported privately by the organizer.
3. Use `USE_REAL_LLM=false` for deterministic rehearsal. No provider credentials are needed.

The migration runner is a small repository-owned SQL runner, not a third-party migration framework. Existing Supabase SQL is retained for historical/source-test references; only `db/migrations` is executable migration authority. Existing hosted data is not migrated by this bootstrap.

## Attempts and recovery

Admission locks current challenge and participant, validates activity/phase, and atomically reserves an available slot **before** any evaluator call. Supply a fresh `Idempotency-Key` (ASCII alphanumeric, underscore or hyphen, at most 128 characters) per logical submission and reuse it for network retries. A completed key returns the stored safe response; a pending key does not repeat evaluation; reuse for a different prompt is rejected. Requests without a key receive a random server key and therefore cannot be deduplicated across network retries.

Finalization locks the reservation and commits run, all items, submission and safe replay response together. Query errors, even handled errors inside an aborted transaction, cannot report a successful commit. Evaluation failures release the slot as failed. Challenge scoring configuration is locked while a reservation is pending and after successful submissions. Admin clear/reset includes reservations and does not permit an in-flight finalizer to recreate cleared records.

An application crash can leave a pending reservation. It intentionally does **not** expire automatically, because retrying a possibly completed paid evaluation is not safe. Inspect pending reservations with organizer/database access; for rehearsal, the existing explicit participant clear or workshop reset action releases them and clears the corresponding participant/event run history. Do not reset a live event merely to clear one pending attempt. A targeted, approved operator recovery can mark a confirmed abandoned reservation failed only after confirming its evaluator process is no longer running. Durable paid evaluator jobs and automatic restart recovery are outside this deterministic milestone.

## Verification

`npm run test:database` requires a disposable database literally named `gpo_test`, already migrated and seeded. It clears its synthetic run data. It exercises 12-request admission bursts, idempotency replay, SQL failure rollback, 5-public/45-hidden evaluation, concurrent final exclusivity, stored row counts, dashboard/leaderboard and admin clearing. Never point it at a real event.

App rollback alone does not roll schema backward. Take database snapshots/backups before applying migrations to an existing event. Restore into a separate database and validate before switching application connection settings; do not destructively undo additive migrations in place.
