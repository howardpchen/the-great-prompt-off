-- Admin event phase controls for The Great Prompt-Off.
-- Run this once in Supabase before deploying event phase controls.

alter table challenges
  add column if not exists event_phase text not null default 'not_started';

alter table challenges
  drop constraint if exists challenges_event_phase_check;

alter table challenges
  add constraint challenges_event_phase_check
    check (event_phase in ('not_started', 'practice_open', 'final_open', 'ended'));

comment on column challenges.event_phase is
  'Organizer-controlled event phase that gates participant workspace actions and submissions.';
