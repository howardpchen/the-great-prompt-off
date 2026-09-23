# Shared request-start pacing

Provider attempts (Sandbox, scored submissions, and retries) use the same in-process scheduler. Starts are spaced by at least 250 ms: at most four starts in a half-open rolling second. The first request after a sufficiently long idle period starts immediately; there is no token bucket or catch-up burst.

The default simultaneous-call ceiling is 10 (`OPENROUTER_CONCURRENCY=10`). Existing explicit environment values take precedence; changing the code default alone does **not** lower an existing deployment's ceiling. A release must deliberately set its runtime override to 10 and verify admission telemetry. Overrides remain bounded to 1–50 for separately calibrated deployments; pacing stays fixed at 4 starts/second. Per-submission fanout is at most 20 and never above the configured shared ceiling.

Pacing and concurrency constrain different things. Fast responses may produce fewer than ten overlapping calls. A hundred queued reports are not a hundred simultaneous requests: their starts need at least 24.75 seconds, plus the last response's duration, even without throttling.

## Preserved behavior

- Scored work has priority with bounded Sandbox service (at most three scored admissions before a waiting Sandbox admission).
- Least-recently-served groups rotate within each class.
- Existing adaptive throttling can lower the effective concurrent ceiling, honor cooldown and recover gradually under healthy demand.
- Pacing waits do not hold concurrency slots. Retries release their slot and re-enter the same paced queue after bounded backoff.
- Cancellation and queue deadlines still apply. No prompt, report or answer content is logged.
- Admission telemetry includes `startIntervalMs` alongside queue wait, active/waiting, configured ceiling and adaptive effective ceiling. HTTP events retain actual overlap/timing.

The limit is system-wide for the existing **single app process**, not distributed across replicas. State is in memory and resets on process restart. Multi-replica operation would need coordinated admission before adding replicas.

## Verification

Tests exercise 100 queued reports, cancellation/deadlines, idle boundaries, fairness, cooldown release, retries, and the actual public-submission path with two concurrent submissions. All provider responses are simulated; no paid inference or participant budget is consumed by these tests.
