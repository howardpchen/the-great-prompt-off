-- Admin-only rescue override for granting extra public Test Attempts.
-- Run this in the Supabase SQL Editor before using "

comment on table participant_attempt_overrides is
  'Stores narrow admin overrides for extra public Test Attempts. Does not affect Final Submission.';
comment on column participant_attempt_overrides.extra_public_attempts is
  'Additional public Test Attempts granted by an admin for this participant.';

create index if not exists participant_attempt_overrides_updated_at_idx
  on participant_attempt_overrides (updated_at desc);
