> **Historical document — not current setup instructions.** This records the earlier Supabase/Vercel design. Current runtime uses direct PostgreSQL; use [README.md](README.md), [db/README.md](db/README.md), and [deploy/README.md](deploy/README.md). Do not execute legacy SQL or seeding commands from this document.

# Meeting Update

This document summarizes progress since the doctor meeting and frames the current state for the next discussion.

## 1. What Changed Since The Meeting

- Scoring now accepts these strict controlled output values:
  - `present`
  - `absent`
  - `uncertain`
- `not_reported` was added for findings that the report does not provide enough information to determine.
- Clinical phrases such as `intact`, `partial tear`, `trace`, `yes`, or `no` are now invalid values rather than being silently mapped to controlled labels.
- The participant prompt editor now focuses on one editable clinical extraction section. Output formatting is controlled by a hidden server-side task contract.
- Scoring regression tests were added with Vitest.
- `PROJECT_ARCHITECTURE.md` was rewritten as the main system/data-flow explanation.
- `DEMO_CHECKLIST.md` was expanded into the live rehearsal and run-of-show checklist.
- Supabase is documented as the live source of truth after seeding.
- Local synthetic report `.txt` files were moved out of `public/` into `seed-data/mock-reports/`.
- Local report fallback is gated behind `ALLOW_LOCAL_FALLBACK=true`.
- Security hardening was added:
  - prompt length limit
  - generic participant-facing model/provider errors
  - CSV formula-injection protection

## 2. How Changes Map To The Doctor's Feedback

### Stricter Data Structure

The scoring system now enforces the controlled output contract more honestly. Only `present`, `absent`, `uncertain`, and `not_reported` receive credit. Clinical phrases still do not receive credit. `not_reported` addresses the concern that the model should not guess when a finding is not mentioned.

### Separating Clinical Reasoning From Formatting

The prompt design now separates the two responsibilities:

- the participant controls the clinical extraction strategy
- the platform controls the machine-readable output contract

The hidden contract contains formatting and unsupported-inference handling only. It does not contain medical reasoning answers or report-specific hints.

Existing answer keys were not rewritten. They should be manually reviewed before using `not_reported` as a real expected answer for reports where a finding is not mentioned.

### Better Software Discipline

The new architecture/data-flow documentation explains where reports, answer keys, prompts, outputs, scores, submissions, and admin controls live. This makes the project easier to reason about without relying on Codex.

### Edge Cases And Security

Several edge-case/security issues were addressed:

- oversized prompts are blocked before evaluation
- model/provider errors are shown as safe generic messages to participants
- CSV exports are protected against spreadsheet formula injection
- private/final local report files are no longer browser-accessible static assets

### Rehearsal Readiness

The run-of-show checklist gives a practical event sequence:

- setup
- reset
- practice round
- final round
- reveal/end
- exports
- failure checks

## 3. Current System Status

The app currently supports:

- participant access-code login
- public Test Attempts
- locked Final Submission
- strict scoring values
- participant clinical extraction prompt editor with platform-controlled formatting
- public Test Attempt diagnostics
- sanitized Final Submission feedback
- event phases
- leaderboard visibility controls
- projector leaderboard
- admin progress monitor
- admin participant management
- extra Test Attempt override
- reset tools
- Supabase-backed reports, answer keys, prompt runs, run items, and submissions
- OpenRouter-backed evaluation when configured
- local seed/dev report files outside `public/`
- scoring regression tests

Current intended data source:

- Supabase `reports` table for live report text
- Supabase `answer_keys` table for hidden labels
- Supabase `prompt_runs`, `prompt_run_items`, and `submissions` for run/results storage
- `seed-data/mock-reports/` only for seeding or explicitly enabled local fallback

## 4. Rehearsed Or Still Need To Rehearse

Already covered in code/docs:

- scoring regression tests for strict values and recovery behavior
- build/lint/test checks
- run-of-show checklist
- documentation for architecture and migrations

Still important to rehearse manually:

- fresh deployment on Vercel
- admin login
- Supabase Health Check
- full reset before rehearsal
- participant login with a test access code
- practice phase with Test Attempts
- final phase with one Final Submission
- ended phase and projector leaderboard
- over-length prompt rejection
- invalid value diagnostics during a Test Attempt
- simulated model/provider failure
- final failure not locking submission
- export access codes and results CSV
- `/mock-reports/...` public URLs no longer resolving
- seed script still populating Supabase from `seed-data/mock-reports/`

## 5. Questions For The Next Meeting

- Is the platform-controlled formatting/task contract appropriately separated from the participant's clinical strategy?
- Is the strict `present` / `absent` / `uncertain` / `not_reported` label set clinically sufficient for this workshop?
- Should public Test Attempt feedback show more or less detail?
- Should final feedback show only score, or also aggregate format diagnostics?
- Are five public Test Attempts the right number?
- Are five public reports and forty-five hidden final reports the right split?
- Should the app eventually support configurable finding definitions beyond knee MRI?
- Should report/answer-key management remain admin-live editable, or should bulk file-based import be the preferred workflow?
- What level of participant identity/security is appropriate for the next version?
- Should real final evaluations move to an async queue if the report set grows?
