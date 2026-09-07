-- Admin-controlled live participant announcement.
-- Run this once in Supabase before deploying event announcements.

alter table challenges
  add column if not exists event_announcement text not null default '';

comment on column challenges.event_announcement is
  'Short organizer announcement shown as plain text in the participant workspace.';
