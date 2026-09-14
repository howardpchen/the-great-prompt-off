-- Capture the exact admitted instruction version before any provider work.
-- Hashes remain the immutable final-lock comparison; this text enables team recovery.
ALTER TABLE attempt_reservations ADD COLUMN prompt_text text;
COMMENT ON COLUMN attempt_reservations.prompt_text IS
 'Protected team instructions retained on infrastructure failure; never a public leaderboard field.';
-- Recover historical successful versions only when their hash proves an exact match.
UPDATE attempt_reservations a SET prompt_text=p.prompt_text
FROM submissions s JOIN prompt_runs p ON p.id=s.prompt_run_id
WHERE a.status='completed' AND a.challenge_id=s.challenge_id
 AND a.participant_id=s.participant_id AND a.kind=s.submission_type
 AND a.attempt_number=s.attempt_number
 AND a.prompt_hash=encode(digest(p.prompt_text,'sha256'),'hex');
-- Old failed hashes cannot reconstruct text. Leave NULL rather than inventing it.
