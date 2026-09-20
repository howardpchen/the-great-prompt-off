# Prompt Sandbox

Workflow: unscored three-report sandbox, separate from five scored practice attempts and one final. A participant must wait 60 seconds after a sandbox batch finishes before another can start; one in-flight batch. The server persists this participant-wide cooldown across tabs, contests and process restarts. A failed or cancelled admitted batch also starts the cooldown; validation errors and idempotent replays do not. Edited sample text never overwrites source reports, answers, budgets or scores. Sample output shows predicted field values/no-decision, never correctness against old references. Only sandbox samples may be fetched; hidden data cannot be selected by client identifiers. Same fixed model and extraction contract as scored evaluations. Field-level clinical descriptions remain excluded from model messages.


## Parallel processing

OpenRouter official limits documentation checked2026-09-17:
https://openrouter.ai/docs/api/reference/limits
Paid model variants have no platform-level request cap; upstream capacity/429, DDoS protection, credit caps and an in-flight spending budget still apply. There is no universal documented maximum number of simultaneous report calls. Do not cite third-party historic credit-to-RPS formulas as a concurrency guarantee.

Configurable shared report worker limit, default 20 and configurable ceiling 50, applies across sandbox and scored traffic in the single app process. Allow an OPENROUTER_CONCURRENCY operational override; do not change live env during local implementation. This is a system-level limit, not 20 per participant. Sandbox tasks fairly interleave by team, scored traffic has priority with bounded fairness, finite queue and wait deadline. Honor Retry-After on bounded 429/503 and explicitly identified in-flight-budget 402 retries (5/15/30 seconds plus positive jitter; cumulative retry sleep at most 120 seconds); never switch to a different model to evade capacity. Test with delayed/malformed/throttled provider stubs; real capacity and spend require separate calibration.

## Durable state

Sandbox jobs/results stored separately from scored tables. Team-scoped read access, snapshot prompt/report text, idempotent admission under DB lock, completion-based cooldown survives process restarts. A request-owned streaming worker publishes complete report results as they finish; reconnect reads retained job state without rerunning. Interrupted jobs expire after a bound exceeding per-report request+queue/retry timeout; late workers cannot overwrite terminal jobs. Multi-app-process deployment requires distributed provider semaphore before claiming a cross-instance limit.

## Acceptance

No budget/leaderboard changes; protected samples and cross-team status; stale contest/version rejection; 60 seconds after completion across browser sessions; duplicate idempotent reuse; queued/failed request behavior; one batch per team; per-report progress; three editable originals/reset; previous-run comparison; mock output prominently synthetic and independent of reference answers; disabled by default organizer toggle; no silent live enablement.

## Dataset isolation

Keep sandbox, public practice, and hidden final reports disjoint. Configure their allocation privately for each contest. Keep report identifiers, text, references, split manifests, and contest-specific settings outside application Git. If scored history exists, prepare a new contest version rather than altering reports underlying existing scores.

## Operational boundaries

The supported deployment has one Node app process; a global process registry shares slots even across route bundles. Do not scale replicas until distributed slots replace it. Max queued calls: 1,000, each waiting at most 15 minutes. Sandbox batch watchdog: 19 minutes, persistent orphan expiry: 20 minutes. Saturation is visible failure, never a silent discarded request. Explicit 429/503 and identified transient in-flight-budget 402 responses receive at most three retries, with at most 120 seconds of cumulative retry sleep; queue wait and request duration are additional. A provider Retry-After minimum exceeding the remaining retry budget is surfaced, never shortened or ignored. Retry sleeps hold no call slot. Ambiguous transport errors, timeouts, invalid output and credit exhaustion are not automatically replayed.

Only authenticated participants can read their own run state. Closing a streaming request cancels queued/fetch work where possible; already-sent provider requests may still incur cost. A restarted process does not replay paid work: orphaned jobs expire into failure and start cooldown. The original reports and accepted answers never change when sandbox text is edited.

Participant drafts remain in their browser; latest run inputs/results are retained privately in the database for recovery. Before a prolonged live event, review database capacity and choose a retention policy; no automatic destructive history cleanup is part of this release. If the target already has scored history, create a new contest version rather than silently reclassifying reports underlying old scores.
