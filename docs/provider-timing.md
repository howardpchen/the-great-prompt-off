# Provider timing and concurrency

Server-only JSON-line metrics (`metric: prompt_off_provider`, version1) go to the existing application log sink. They are **not participant feedback**, database rows, or clinical audit records. Log retention depends on deployment configuration; export relevant logs before replacing containers. No dashboard or indefinitely durable metrics store is claimed.

Each scored batch uses its attempt-reservation UUID as `batchId`; Sandbox uses its job UUID. Each extraction has a random request UUID; `reportIndex` is a zero-based position, not a filename or source report ID. Prompts, reports, labels, raw model outputs, participant identities, credentials and provider error bodies are excluded. No scores are logged. Restrict operational-log access.

- `batch_start/end`: kind, report count, configured fan-out, wall duration and measured peak outstanding HTTP attempts in this batch. Completion includes validation/scoring but precedes score persistence for public/final.
- `submission_end`: admitted public/final operation wall time including reads, scoring and persistence/refund. Replays do not initiate evaluation or emit a new batch.
- `admission`: queue wait, allocated slots, waiting length, configured ceiling and current adaptive cap. Allocated slots are not necessarily simultaneous network requests.
- `http_start/end`: measured active HTTP attempts (process and batch), headers arrival, full JSON body arrival, validation duration, status/outcome, total HTTP/validation time, actual response provider, finish reason, token counts and cost when returned.
- `retry`: scheduled backoff. `report_end`: attempts, retries, cumulative queue/backoff and total extraction time. `queue_exit`: rejected/cancelled admission. Missing end events identify incomplete traces, not successful runs.

Durations use a monotonic clock, milliseconds. Header latency is **not first-token latency**: current provider requests are non-streaming. HTTP spans include response parsing and validation. Concurrent durations must not be summed as batch wall time. `peakHttp` is application-observed overlapping HTTP attempts, not proof of simultaneous provider GPU execution. In-memory counters reset on app restart; no distributed multi-replica guarantee.

`prompt_runs.started_at` now captures pre-evaluation time; historical rows with near-zero elapsed durations remain unchanged. Historical attempt-reservation timestamps are preferable for those runs.

Use `docker logs --since <time> <app-container>` and `node scripts/summarize-provider-timing.mjs <captured-log>` to summarize completed/incomplete batches. No need to query report content or expose runtime environment.
