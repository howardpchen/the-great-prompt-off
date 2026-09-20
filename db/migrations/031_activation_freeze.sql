-- Activation is a permanent evaluation contract, independent of retained run rows.
ALTER TABLE challenges ADD COLUMN configuration_frozen_at timestamptz;
UPDATE challenges c SET configuration_frozen_at=now(),schema_locked=true
WHERE is_active OR schema_locked
 OR EXISTS(SELECT 1 FROM submissions WHERE challenge_id=c.id)
 OR EXISTS(SELECT 1 FROM attempt_reservations WHERE challenge_id=c.id)
 OR EXISTS(SELECT 1 FROM sandbox_jobs WHERE challenge_id=c.id)
 OR EXISTS(SELECT 1 FROM prompt_runs WHERE challenge_id=c.id);

CREATE FUNCTION public.guard_activation_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.configuration_frozen_at IS NOT NULL THEN RAISE EXCEPTION 'Frozen contests cannot be deleted; archive instead.' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.configuration_frozen_at IS NOT NULL THEN
  IF OLD.configuration_frozen_at IS DISTINCT FROM NEW.configuration_frozen_at OR NOT NEW.schema_locked
   OR OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description
   OR OLD.instructions IS DISTINCT FROM NEW.instructions OR OLD.output_schema IS DISTINCT FROM NEW.output_schema
   OR OLD.contest_schema IS DISTINCT FROM NEW.contest_schema OR OLD.schema_version IS DISTINCT FROM NEW.schema_version
   OR OLD.mode_id IS DISTINCT FROM NEW.mode_id OR OLD.evaluation_model IS DISTINCT FROM NEW.evaluation_model
   OR OLD.locked_model IS DISTINCT FROM NEW.locked_model OR OLD.schema_ready IS DISTINCT FROM NEW.schema_ready
   OR OLD.public_submission_limit IS DISTINCT FROM NEW.public_submission_limit
   OR OLD.final_submission_limit IS DISTINCT FROM NEW.final_submission_limit THEN
   RAISE EXCEPTION 'Contest configuration is frozen after activation. Duplicate as a new draft.' USING ERRCODE='55000';
  END IF;
  IF OLD.event_phase='ended' AND NEW.event_phase<>'ended' THEN RAISE EXCEPTION 'Revealed results cannot be hidden.' USING ERRCODE='55000'; END IF;
 END IF;
 IF NEW.is_active THEN
  IF NOT NEW.schema_ready THEN RAISE EXCEPTION 'Contest must be ready before activation.' USING ERRCODE='55000'; END IF;
  NEW.configuration_frozen_at:=COALESCE(NEW.configuration_frozen_at,clock_timestamp());
  NEW.schema_locked:=true;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_guard_activation_contract BEFORE INSERT OR UPDATE OR DELETE ON challenges FOR EACH ROW EXECUTE FUNCTION public.guard_activation_contract();
-- Check both ends of a move: reassignment must not move content out of frozen contests.
CREATE OR REPLACE FUNCTION public.guard_contest_reports() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; locked boolean;
BEGIN
 FOR cid IN SELECT id FROM challenges WHERE id IN (
  CASE WHEN TG_OP<>'INSERT' THEN OLD.challenge_id END,
  CASE WHEN TG_OP<>'DELETE' THEN NEW.challenge_id END) ORDER BY id FOR UPDATE LOOP
  SELECT schema_locked OR configuration_frozen_at IS NOT NULL INTO locked FROM challenges WHERE id=cid;
  IF locked THEN RAISE EXCEPTION 'Reports are locked. Duplicate as a new draft.' USING ERRCODE='55000'; END IF;
  UPDATE challenges SET schema_ready=false WHERE id=cid AND contest_schema IS NOT NULL;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_contest_answer_keys() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; locked boolean;
BEGIN
 FOR cid IN SELECT c.id FROM challenges c WHERE c.id IN (SELECT r.challenge_id FROM reports r WHERE r.id IN (
  CASE WHEN TG_OP<>'INSERT' THEN OLD.report_id END,
  CASE WHEN TG_OP<>'DELETE' THEN NEW.report_id END)) ORDER BY c.id FOR UPDATE LOOP
  SELECT schema_locked OR configuration_frozen_at IS NOT NULL INTO locked FROM challenges WHERE id=cid;
  IF locked THEN RAISE EXCEPTION 'Answer keys are locked. Duplicate as a new draft.' USING ERRCODE='55000'; END IF;
  UPDATE challenges SET schema_ready=false WHERE id=cid AND contest_schema IS NOT NULL;
 END LOOP;
 IF TG_OP='UPDATE' AND OLD.provenance='clinician_adjudicated' AND (OLD.answer_values IS DISTINCT FROM NEW.answer_values OR OLD.provenance IS DISTINCT FROM NEW.provenance) THEN
  RAISE EXCEPTION 'Clinician-adjudicated keys require a new schema version.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_activation_contract() FROM PUBLIC;
