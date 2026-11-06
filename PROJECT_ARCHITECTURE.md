# Project architecture

## Runtime and trust boundaries

The browser talks to Next.js App Router handlers. Only server code connects to PostgreSQL through `app/lib/db/pool.ts` and `app/lib/db/database.ts`. The compatibility modules under `app/lib/supabase/` use that same direct database layer; there is no Supabase client, browser database role or Supabase credential requirement.

The application role has DML privileges; the migration role owns the schema. Application-owned SQL functions are allowlisted and use invoker privileges. The query builder binds values and validates identifiers. Raw SQL call sites must continue to parameterize untrusted values. See [db/README.md](db/README.md).

The default [Compose packaging](compose.yaml) keeps PostgreSQL on an internal network, publishes only a loopback application port and separates migration tooling from the unprivileged application image. Environment/secret mounts and reverse-proxy settings are operator-owned, not event data checked into Git. [Deployment](deploy/README.md) describes the private rehearsal baseline, not automatic public exposure or paid evaluation.

## Data model

| Table | Role |
| --- | --- |
| `challenges` | Contest identity, schema/version, readiness, phase, limits, model and archive state. |
| `reports` | Contest-scoped report text and sample/public/private split. |
| `answer_keys` | Report references keyed by mode/schema version, with values and provenance. |
| `participants` | Shared identities, private access codes, active state and optional identifying metadata. |
| `participant_attempt_overrides` | Additional public-attempt grants, scoped to contest and participant. |
| `attempt_reservations` | Admission, idempotency, frozen instructions, pending/completed/failed state and safe response/progress. |
| `prompt_runs` | Prompt, model, schema snapshot, timings and aggregate evaluation. |
| `prompt_run_items` | Per-report raw/parsed output, validation errors and scores; server-only storage. |
| `submissions` | Counted public/final attempts linked to participant, contest and run. |
| `sandbox_jobs` | Sandbox instructions, caller-supplied practice reports, results, lifecycle and cooldown. |
| `simulation_batches`, `simulation_runs`, `simulation_run_items` | Isolated deterministic rehearsal metadata/results. |
| `schema_migrations` | Ordered migration ledger and SQL checksums. |

Do not join references on `report_id` alone: also use the relevant mode and schema version. Do not pool archived contests, Sandbox jobs and scored submissions as independent observations. This table inventory is schema documentation, not a snapshot of any private event's counts/content.

## Contest lifecycle

The organizer defines classification/measurement fields, exact allowed values, weights, nullability and reference readiness. Active fields, split sizes, budgets and models are persisted configuration, not fixed six-field/50-report constants. Built-in synthetic examples remain useful fixtures without describing the live event.

A schema edit creates a new draft version; imports validate complete matching coverage atomically. Admission freezes the relevant configuration even if evaluation fails. Forking and archiving preserve prior histories; resets are explicit destructive operations, not a code-deployment step. See [configurable contests](docs/configurable-contests.md), [contest library](docs/contest-library.md) and [educational workflow](docs/educational-workflow.md).

## Authentication and HTTP

- Admin login uses an independent minimum-32-byte secret; signed HttpOnly, SameSite=Strict cookies expire after eight hours and are Secure in production.
- Participant login validates an access code server-side and issues a signed eight-hour token. Browser storage is sessionStorage; guarded reads/admission check the account and derive identity from the token.
- Access-code regeneration does not revoke issued tokens; deactivation is the existing account-level block. The signing design has no per-token revocation ledger.
- The proxy enforces exact-origin writes for API/admin routes, no-store/referrer headers and anti-framing/content-type headers. Authenticated handlers still enforce their own authorization; same-origin is not authentication.
- Login quotas are process-local, global per login kind. Submission requests are byte-bounded before parsing; prompt semantics have a separate 12,000-character cap. Sandbox has its own bounded decoder and cooldown.

## Evaluation flow

1. Authenticate and bind the request to the expected contest/version.
2. Atomically reserve an available attempt under database locks before model calls. Idempotency prevents a repeated request from purchasing another evaluation.
3. Resolve the stored schema and appropriate public or held-out report/reference set.
4. Run deterministic evaluation or the configured provider with shared concurrency, pacing, retries, output validation and participant-safe errors. Never treat model text as executable instructions or trusted HTML.
5. Finalize the run, items, submission and safe replay response transactionally. Failed infrastructure releases its slot without partially committed scores.
6. Return only the permitted response projection. Practice feedback supports per-field comparisons; held-out report text, keys and raw final outputs stay private. Educational final aggregates remain hidden until the reveal phase.

Public submissions support `Prefer: respond-async`, `next/server` after-work and authenticated progress polling. Final submission uses the server's evaluation path; process-local asynchronous work is not a durable external queue. After a crash, inspect worker state before releasing reservations. See [attempt recovery](db/README.md#attempts-and-recovery) and [Sandbox](docs/prompt-sandbox.md).

## Operational interfaces

- `/api/health`: liveness; `/api/health/ready`: database connectivity, not schema/reference/capacity acceptance.
- `/api/health/supabase`: legacy compatibility health route, still PostgreSQL-backed; do not add hosted-database keep-alives for it.
- `/admin`: authenticated contest controls; `/admin/cases`: reports/references; `/admin/analytics`: calibration; `/admin/simulations`: deterministic rehearsal.
- `/challenge`: participant workspace; `/display/leaderboard`: phase/visibility-controlled projection.

Only `db/migrations/` is executable migration authority. Apply reviewed migrations explicitly with `npm run db:migrate`; never replay `supabase/*.sql` or seed over an existing event. Backup/restore is separate from app rollback.

## Verification and limitations

Vitest checks parsing, authorization/session boundaries, scoring, final privacy, contest isolation and request safeguards. Playwright and guarded disposable-database scripts exercise browser/storage paths. Provider simulation does not prove clinical validity or real-model reliability. See [the basic security review](docs/security-audit-2026-11.md) for reviewed scope and residual risks; it is not a comprehensive penetration test.
