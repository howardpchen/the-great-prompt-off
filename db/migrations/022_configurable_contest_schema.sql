-- Definitions live with each contest; historical run snapshots remain immutable.
ALTER TABLE challenges ADD COLUMN contest_schema jsonb;
ALTER TABLE challenges ADD COLUMN schema_locked boolean NOT NULL DEFAULT false;
ALTER TABLE challenges ADD COLUMN schema_ready boolean NOT NULL DEFAULT true;
UPDATE challenges c SET schema_locked=true WHERE EXISTS(SELECT 1 FROM submissions s WHERE s.challenge_id=c.id) OR EXISTS(SELECT 1 FROM attempt_reservations a WHERE a.challenge_id=c.id);
CREATE OR REPLACE FUNCTION public.prevent_locked_challenge_configuration_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF new.event_phase IN ('practice_open','final_open') AND NOT new.schema_ready THEN
   RAISE EXCEPTION 'Contest answer keys are not ready. Close submissions before editing.' USING ERRCODE='55000';
 END IF;
 IF (old.schema_locked OR EXISTS(SELECT 1 FROM submissions WHERE challenge_id=old.id)
     OR EXISTS(SELECT 1 FROM attempt_reservations WHERE challenge_id=old.id)) AND (
      old.evaluation_model IS DISTINCT FROM new.evaluation_model OR old.mode_id IS DISTINCT FROM new.mode_id
      OR old.schema_version IS DISTINCT FROM new.schema_version OR old.output_schema IS DISTINCT FROM new.output_schema
      OR old.contest_schema IS DISTINCT FROM new.contest_schema OR old.schema_locked AND NOT new.schema_locked
      OR old.schema_ready IS DISTINCT FROM new.schema_ready) THEN
   RAISE EXCEPTION 'Contest schema is locked. Create a new contest version to preserve scores.' USING ERRCODE='55000';
 END IF;
 RETURN new;
END $$;
CREATE FUNCTION public.freeze_contest_schema_on_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT (SELECT schema_ready FROM challenges WHERE id=new.challenge_id) THEN
   RAISE EXCEPTION 'Contest answer keys are not ready.' USING ERRCODE='55000';
 END IF;
 UPDATE challenges SET schema_locked=true WHERE id=new.challenge_id;
 RETURN new;
END $$;
CREATE TRIGGER freeze_contest_schema_on_attempt BEFORE INSERT ON attempt_reservations FOR EACH ROW EXECUTE FUNCTION freeze_contest_schema_on_attempt();
-- Answer-key content participates in score comparability, not only field definitions.
CREATE FUNCTION public.guard_contest_answer_keys() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; locked boolean;
BEGIN
 SELECT challenge_id INTO cid FROM reports WHERE id=COALESCE(new.report_id,old.report_id);
 SELECT schema_locked INTO locked FROM challenges WHERE id=cid FOR UPDATE;
 IF locked THEN RAISE EXCEPTION 'Answer keys are locked. Create a new contest version.' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND old.provenance='clinician_adjudicated' AND (old.answer_values IS DISTINCT FROM new.answer_values OR old.provenance IS DISTINCT FROM new.provenance) THEN
   RAISE EXCEPTION 'Clinician-adjudicated keys require a new schema version before replacement.' USING ERRCODE='55000';
 END IF;
 UPDATE challenges SET schema_ready=false WHERE id=cid AND contest_schema IS NOT NULL;
 IF TG_OP='DELETE' THEN RETURN old; END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_contest_answer_keys BEFORE INSERT OR UPDATE OR DELETE ON answer_keys FOR EACH ROW EXECUTE FUNCTION guard_contest_answer_keys();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
CREATE FUNCTION public.guard_contest_reports() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; locked boolean;
BEGIN
 cid := CASE WHEN TG_OP='DELETE' THEN old.challenge_id ELSE new.challenge_id END;
 SELECT schema_locked INTO locked FROM challenges WHERE id=cid FOR UPDATE;
 IF locked THEN RAISE EXCEPTION 'Reports are locked. Create a new contest version.' USING ERRCODE='55000'; END IF;
 UPDATE challenges SET schema_ready=false WHERE id=cid AND contest_schema IS NOT NULL;
 IF TG_OP='DELETE' THEN RETURN old; END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_contest_reports BEFORE INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION guard_contest_reports();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
-- With multiple retained contest versions, reset/clear must not erase archived runs.
CREATE OR REPLACE FUNCTION public.admin_reset_workshop_run_data() RETURNS void LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
 SELECT id INTO cid FROM challenges WHERE is_active ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 PERFORM id FROM participants ORDER BY id FOR UPDATE;
 DELETE FROM attempt_reservations WHERE challenge_id=cid;
 DELETE FROM prompt_run_items WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE challenge_id=cid);
 DELETE FROM submissions WHERE challenge_id=cid;
 DELETE FROM prompt_runs WHERE challenge_id=cid;
 DELETE FROM participant_attempt_overrides WHERE true;
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
 DELETE FROM participant_attempt_overrides WHERE participant_code=trim(target_participant_code);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
