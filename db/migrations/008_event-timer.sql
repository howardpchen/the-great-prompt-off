-- Admin-controlled display-only event timer.
-- Run this once in Supabase before deploying event timers.

alter table challenges
  add column if not exists event_timer_ends_at timestamptz null,
  add column if not exists event_timer_label text not null default '';

comment on column challenges.event_timer_ends_at is
  'Optional display-only organizer timer end time shown in the participant workspace.';

comment on column challenges.event_timer_label is
  'Optional short label for the display-only organizer timer.';
