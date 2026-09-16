-- Bind historical grants to the previously active contest; never copy them to future contests.
ALTER TABLE participant_attempt_overrides ADD COLUMN challenge_id uuid REFERENCES challenges(id);
UPDATE participant_attempt_overrides SET challenge_id=(SELECT id FROM challenges WHERE is_active);
-- NOT NULL deliberately refuses orphan historical overrides when there is no active contest.
ALTER TABLE participant_attempt_overrides ALTER COLUMN challenge_id SET NOT NULL;
ALTER TABLE participant_attempt_overrides DROP CONSTRAINT participant_attempt_overrides_pkey;
ALTER TABLE participant_attempt_overrides ADD PRIMARY KEY(challenge_id,participant_code);
CREATE OR REPLACE FUNCTION public.admin_reset_workshop_run_data() RETURNS void LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
 SELECT id INTO cid FROM challenges WHERE is_active ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 PERFORM id FROM participants ORDER BY id FOR UPDATE;
 DELETE FROM attempt_reservations WHERE challenge_id=cid;
 DELETE FROM prompt_run_items WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE challenge_id=cid);
 DELETE FROM submissions WHERE challenge_id=cid;
 DELETE FROM prompt_runs WHERE challenge_id=cid;
 DELETE FROM participant_attempt_overrides WHERE challenge_id=cid;
END $$;
CREATE OR REPLACE FUNCTION public.admin_clear_participant_run_data(target_participant_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cid uuid; pid uuid;
BEGIN
 SELECT id INTO cid FROM challenges WHERE is_active ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 SELECT id INTO pid FROM participants WHERE participant_code=trim(target_participant_code) FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;
 DELETE FROM attempt_reservations WHERE challenge_id=cid AND participant_id=pid;
 DELETE FROM prompt_run_items WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE challenge_id=cid AND participant_id=pid);
 DELETE FROM submissions WHERE challenge_id=cid AND participant_id=pid;
 DELETE FROM prompt_runs WHERE challenge_id=cid AND participant_id=pid;
 DELETE FROM participant_attempt_overrides WHERE challenge_id=cid AND participant_code=trim(target_participant_code);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
