-- Admin-controlled participant leaderboard visibility.
-- Run this once in Supabase before deploying leaderboard visibility controls.

alter table challenges
  add column if not exists leaderboard_visibility text not null default 'practice';

alter table challenges
  drop constraint if exists challenges_leaderboard_visibility_check;

alter table challenges
  add constraint challenges_leaderboard_visibility_check
    check (leaderboard_visibility in ('hidden', 'practice', 'final', 'ended', 'always'));

comment on column challenges.leaderboard_visibility is
  'Organizer-controlled participant leaderboard visibility mode.';
