# Basic security audit — November 2026

## Scope and limits

Read-only review of GitHub `main` at `26097ce`, the open feedback-reliability candidate, dependency lockfile advisories, authentication/session code, API guards, PostgreSQL query/admission paths, final-result projections and container/CI configuration. Fixes below are the prepared candidate; publication, deployment and runtime validation are separate evidence. This is not a full penetration test, source-history credential certification, infrastructure audit or clinical/privacy certification.

## Findings and candidate fixes

| Priority | Observation | Candidate action |
| --- | --- | --- |
| Critical dependency advisory | Locked Next.js 16.3.8 is in reported affected ranges for framework RCE/DoS advisories. Feature-specific exploitability was not established. | Pin Next.js and matching ESLint config to 16.4.5; refresh compatible locked tooling dependencies. |
| Medium | Public/final submission handlers called `request.json()` before auth and semantic length checks, allowing large bodies to be allocated. | Stream-decode with an 80,000-byte ceiling, cancel overflow and return 413 before verification/evaluation; preserve the separate 12,000-character prompt cap. |
| Medium, configuration-dependent | With `ALLOW_LOCAL_FALLBACK=true`, storage failures could produce mock-success responses in production. | Central development-only fallback policy, applied to submissions, local report fallback, participant validation and fallback leaderboard visibility. Production submissions now fail closed even if misconfigured. |
| Operational | Setup docs/env template still required Supabase keys and instructed obsolete seeding/migration procedures. | Replace current setup/architecture/checklists; clearly mark historical material. Remove obsolete hosted keep-alive workflow/cron and the unused `CLAUDE.md` alias; keep framework-neutral `AGENTS.md`. |

Framework advisories: [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [typed-array cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Absence of an obvious call site does not establish that an affected framework runtime is safe.

## Controls observed in reviewed paths

- Independent minimum-length secrets, HMAC signatures, constant-time comparisons and eight-hour expiry; Secure/HttpOnly/SameSite organizer cookies in production.
- Exact-origin browser-write gate; account validation and session-derived participant identity on reviewed history/progress/Sandbox/submission paths; authenticated admin route guards.
- Bound SQL values, validated identifiers and allowlisted SQL functions; locked atomic attempt admission/finalization and participant/contest-bound idempotency.
- Server-only storage and allowlisted final responses; practice comparisons intentionally differ from held-out privacy rules.
- Fixed inference endpoint, server-only provider keys, timeout/pacing controls and participant-safe evaluation errors.
- DML-only runtime role, separate migration tooling, private database network, loopback app binding and unprivileged/read-only app image in baseline packaging.

These are bounded code observations, not proof that every route or external deployment is secure.

## Remaining issues / follow-up

1. **Moderate, development-only dependencies:** compatible updates leave a minimatch advisory and transitive ESLint/TypeScript tooling audit entries. The automatic suggested fix includes a framework-config downgrade; do not force it. Avoid untrusted glob input in tooling and re-evaluate a compatible upstream release. Production audit after the candidate changes has zero findings; the full audit still has eight moderate entries (one root advisory plus dependency chains).
2. **Session revocation:** regenerating a participant access code does not invalidate issued signed tokens until expiry. Deactivation blocks reviewed guarded paths. A per-account session version/revocation mechanism would be a separate migration/behavior change; this patch does not silently alter existing sessions.
3. **Abuse/resource controls:** login quotas are process-local and can globally deny login service; they reset on restart and are not a multi-instance defense. Several organizer JSON decoders still buffer before field/size validation. Use authenticated/private operational boundaries and reviewed ingress request/time limits; the submission fix is not a universal HTTP body/slow-client cap.
4. **Browser hardening:** participant bearer tokens in sessionStorage remain readable by same-origin script. No comprehensive CSP is configured; a compatible nonce-based policy requires a separate framework/browser review. React escaping is not a substitute for an XSS audit.
5. **Legacy health route:** `/api/health/supabase` remains a PostgreSQL-backed compatibility endpoint and may expose active contest metadata if its optional secret is absent. Prefer minimal `/api/health` and `/api/health/ready` for monitoring. Metadata also exists on the intentional public challenge endpoint; this is not a private-report leak.
6. **Runtime freshness:** GitHub and a running release can differ. Include the existing GitHub contest-bound practice-report safeguard in an authorized server update; verify the actual image and unchanged data, not only the repository version.

## Validation

New regressions cover streamed overflow/cancellation without trusting Content-Length, malformed JSON, a full-length Unicode-escaped prompt, both submission endpoints and fail-closed production fallback. Run full units, lint, production build, production/full dependency audits and focused synthetic Playwright regressions on the exact combined candidate. Live verification must use authenticated reads only: do not consume attempts or call an inference provider merely to audit.

Local combined-candidate results: **311/311 unit tests**, full ESLint, production build/TypeScript, and **7/7 focused synthetic Playwright cases** passed. Production audit: zero findings; full audit: eight moderate development-only entries. These checks made no live submissions or inference calls.
