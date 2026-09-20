# Live Event Rehearsal And Run-Of-Show Checklist

Use this checklist before rehearsal and again before the real event. See `README.md` for full setup, `SUPABASE_MIGRATIONS_GUIDE.md` for database setup, and `REPORT_IMPORT_GUIDE.md` for report data changes.

## 1. Pre-Event Setup

- [ ] Pull the latest code locally.
- [ ] Deploy the latest build to Vercel.
- [ ] Confirm Vercel environment variables are set:
  - [ ] `USE_REAL_LLM=true`
  - [ ] `OPENROUTER_API_KEY`
  - [ ] `OPENROUTER_MODEL=google/gemini-2.5-flash`
  - [ ] `OPENROUTER_CONCURRENCY=20`
  - [ ] Supabase URL, anon key, and service-role key variables
  - [ ] `ADMIN_SECRET`
  - [ ] `PARTICIPANT_SESSION_SECRET`
- [ ] Redeploy Vercel after any environment variable change.
- [ ] Run or confirm required Supabase SQL migrations:
  - [ ] `supabase/admin-atomic-clears.sql`
  - [ ] `supabase/event-controls.sql`
  - [ ] `supabase/leaderboard-visibility.sql`
  - [ ] `supabase/event-announcement.sql`
  - [ ] `supabase/event-timer.sql`
  - [ ] `supabase/participant-attempt-overrides.sql`
  - [ ] `supabase/not-reported.sql`
  - [ ] `supabase/evaluation-model.sql`
- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Confirm `/admin` login works.
- [ ] Confirm the active challenge exists in Supabase.
- [ ] Confirm participant count is correct.
- [ ] Confirm public/private report counts are correct.
- [ ] Confirm answer-key count covers all reports.
- [ ] Confirm participant access codes exist.
- [ ] Confirm Admin Health Check shows the resolved model, environment fallback, and any challenge override.
- [ ] In the Evaluation model panel, choose a model override or confirm that environment fallback is selected.
- [ ] Confirm the selector offers only the five approved models and no custom model field.
- [ ] If changing models, rerun calibration before the live event.
- [ ] Run the `/admin/analytics` baseline calibration on public reports.
- [ ] Record blank/nonsense/partial-ACL/basic-all-findings baseline scores before the event.
- [ ] Confirm blank and nonsense baselines are meaningfully lower than a usable clinical strategy.
- [ ] If weak baselines are too high, switch `OPENROUTER_MODEL` or revise the dataset before the live event.
- [ ] Confirm calibration and new submissions use the same resolved model.
- [ ] Confirm `not_reported` is used for insufficient evidence, `absent` only for explicit negation, and `uncertain` only for ambiguity.
- [ ] Confirm `/api/run-sample` returns `410 Gone`.
- [ ] Confirm `/api/health/supabase` returns small safe JSON if using the
      keep-alive health check.
- [ ] Open `/display/leaderboard` and confirm the projector page loads.
- [ ] Confirm favicon/browser tab displays acceptably, allowing for browser favicon caching.

Useful verification SQL:

```sql
select split, count(*) from reports group by split order by split;

select count(*) as participants from participants;

select count(*) as answer_keys from answer_keys;

select id, slug, title, event_phase, leaderboard_visibility, is_active
from challenges
where is_active = true;
```

## 2. Clean Reset Before Rehearsal Or Event

- [ ] Go to `/admin`.
- [ ] Use the full reset action: Clear leaderboard & submissions.
- [ ] Type `RESET` to confirm.
- [ ] Confirm Test submissions are `0`.
- [ ] Confirm Final submissions are `0`.
- [ ] Confirm prompt runs and leaderboard/results are cleared.
- [ ] Confirm `participant_attempt_overrides` are cleared.
- [ ] Confirm participants remain.
- [ ] Confirm access codes remain.
- [ ] Confirm reports/cases remain.
- [ ] Confirm answer keys remain.
- [ ] Confirm the active challenge remains.

## 3. Practice Round Flow

- [ ] In `/admin`, set `event_phase` to `practice_open`.
- [ ] Set `leaderboard_visibility` to `practice`.
- [ ] Optionally set an event announcement.
- [ ] Optionally start a practice timer.
- [ ] Open `/display/leaderboard` on the projector.
- [ ] Log in as a test participant from the home page.
- [ ] Open `/challenge`.
- [ ] Confirm public test reports are visible.
- [ ] Confirm Test Attempts are enabled.
- [ ] Confirm Final Submission is disabled.
- [ ] Enter clinical extraction instructions.
- [ ] Confirm output formatting is platform-controlled and the participant can edit only clinical extraction instructions.
- [ ] Submit one Test Attempt.
- [ ] Confirm score feedback appears.
- [ ] Confirm format diagnostics appear for public Test Attempts.
- [ ] Confirm raw AI output is visible only in public Test Attempt details.
- [ ] Confirm `/display/leaderboard` shows a Test Attempt score.
- [ ] Confirm `/admin` progress monitor updates.
- [ ] Confirm `/admin/results` updates.

## 4. Final Round Flow

- [ ] In `/admin`, set `event_phase` to `final_open`.
- [ ] Set leaderboard visibility for the intended reveal behavior:
  - [ ] `hidden` if scores should stay hidden during final.
  - [ ] `final` if final scores should show during final and ended.
  - [ ] `ended` if scores should show only after the event ends.
- [ ] Set a final-round announcement.
- [ ] Optionally start a final timer.
- [ ] As a participant, confirm public reports remain visible.
- [ ] Confirm Test Attempts are disabled.
- [ ] Confirm Final Submission is enabled.
- [ ] Submit Final once.
- [ ] Confirm the final submitted success state appears.
- [ ] Confirm final score appears if available.
- [ ] Try submitting Final again and confirm it is blocked.
- [ ] Confirm private report text is not shown to the participant.
- [ ] Confirm raw private/final model outputs are not shown to the participant.
- [ ] Confirm answer keys are not shown to the participant.
- [ ] Confirm `/admin` progress monitor shows final submitted.

## 5. Reveal And End Flow

- [ ] In `/admin`, set `event_phase` to `ended`.
- [ ] Set `leaderboard_visibility` to `ended` or the intended reveal setting.
- [ ] Open `/display/leaderboard`.
- [ ] Confirm the final leaderboard appears when visibility allows it.
- [ ] Confirm participants see the event-ended state.
- [ ] Confirm Test Attempts are disabled.
- [ ] Confirm Final Submission is disabled.
- [ ] Confirm submissions are closed from the participant UI.
- [ ] Confirm server-side submission routes reject wrong-phase submissions.

## 6. Admin Operations During Event

- [ ] Use `/admin` for health, phase, announcement, timer, reset, and progress overview.
- [ ] Use `/admin/participants` for participant management.
- [ ] Use `/admin/results` for results and leaderboard monitoring.
- [ ] Use `/admin/cases` only for intentional live case fixes.
- [ ] Use `/display/leaderboard` for the projector.
- [ ] Monitor active/inactive participants in the progress monitor.
- [ ] Grant `+1` Test Attempt only as a live-event rescue.
- [ ] Deactivate a participant only if needed.
- [ ] Regenerate one access code only if a code is compromised or lost.
- [ ] Clear one participant's run/submission data only when intentionally resetting that participant.
- [ ] Export access codes CSV only from admin routes.
- [ ] Export results CSV from `/admin` or `/admin/results`.

## 7. Failure Cases To Rehearse

- [ ] Submit a prompt over `12,000` characters and confirm it is blocked before submission.
- [ ] Confirm an over-limit Test Attempt does not consume an attempt.
- [ ] Confirm an over-limit Final Submission does not lock final.
- [ ] Submit a Test Attempt that returns invalid values such as `intact`, `yes`, or `trace`.
- [ ] Confirm invalid values appear in public Test Attempt diagnostics.
- [ ] Confirm invalid values do not expose answer keys.
- [ ] Temporarily simulate or observe an OpenRouter/model failure.
- [ ] Confirm model/provider failure shows a generic participant-safe error.
- [ ] Confirm model/provider failure does not lock Final Submission.
- [ ] Confirm participants cannot submit Test Attempts during `not_started`, `final_open`, or `ended`.
- [ ] Confirm participants cannot submit Final during `not_started`, `practice_open`, or `ended`.
- [ ] Set leaderboard visibility to `hidden` and confirm participants/projector show the organizer-hidden message.
- [ ] Confirm `/api/run-sample`, `/api/submit-public`, and `/api/submit-final` remain disabled.

## 8. Post-Event

- [ ] Export results CSV.
- [ ] Save results CSV in the event archive.
- [ ] Review `/admin/analytics` for workshop performance trends.
- [ ] Export access codes CSV only if needed for records.
- [ ] Record final event settings:
  - [ ] evaluation model
  - [ ] OpenRouter concurrency
  - [ ] report counts
  - [ ] event phase at close
  - [ ] leaderboard visibility at reveal
- [ ] Record any participant overrides or manual interventions.
- [ ] Optionally tag the Git commit used for the event.
- [ ] Do not reset workshop data until exports are saved and verified.
- [ ] After exports are safely archived, reset run data only if preparing for a new event.
