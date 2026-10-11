# October application sync

This code-only update brings the reusable repository in line with the application improvements made after the September UI/provider release. It includes no challenge instance, report collection, reference labels, participant records, deployment configuration, or provider benchmark results.

## Changes

- Participant workspace: report/field feedback navigation, asynchronous public-test progress, result recovery, display-name editing, event notices and timer, decimal score display, and a 30-second Sandbox cooldown.
- Evaluation: a single report-level format-recovery request for structured-output failures; unrecoverable output is scored missing, while public tests with format recovery on more than one quarter of reports fail without using an attempt. Transport and admission failures are not recast as missing output.
- Provider operations: shared request-start pacing, a ten-call default concurrency ceiling, bounded admission retries, and structured timing telemetry. The ceiling and queue are process-local; multiple app replicas need distributed coordination. The actual runtime override remains an operator choice.
- Organizer tools: a live, process-local Run monitor, a Sandbox-only phase, default radiology-report instruction text for newly configured educational drafts, baseline-preserving draft duplication, and an archived-challenge visibility toggle.

## Rollout notes

Migration `032_sandbox_open_phase.sql` is additive; it does not open Sandbox or alter an existing challenge phase. The new application can run against the migrated schema. Before rolling back to older application code, move any active `sandbox_open` challenge to `not_started`. Changing source defaults does not rewrite existing contest settings or runtime environment variables. The live monitor resets when the app process restarts and is not a distributed queue metric.

This document describes reusable behavior only. Challenge data and operational evidence remain outside GitHub.
