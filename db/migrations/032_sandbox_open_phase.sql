-- Additive phase; existing contest state, samples and scores are unchanged.
ALTER TABLE challenges DROP CONSTRAINT challenges_event_phase_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_event_phase_check
 CHECK(event_phase IN ('not_started','sandbox_open','practice_open','final_open','ended'));

CREATE FUNCTION public.guard_sandbox_open_phase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.event_phase='sandbox_open' THEN
  IF NOT NEW.schema_ready THEN
   RAISE EXCEPTION 'Contest must be ready before opening Sandbox.' USING ERRCODE='55000';
  END IF;
  IF COALESCE(NEW.contest_schema->'education'->>'version','')<>'1' THEN
   RAISE EXCEPTION 'Sandbox requires a structured educational contest.' USING ERRCODE='55000';
  END IF;
  IF NOT NEW.sandbox_enabled OR (SELECT count(*) FROM reports WHERE challenge_id=NEW.id AND split='sample')<>3 THEN
   RAISE EXCEPTION 'Configure exactly three sandbox samples before opening Sandbox.' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_sandbox_open_phase BEFORE INSERT OR UPDATE OF event_phase ON challenges
 FOR EACH ROW EXECUTE FUNCTION public.guard_sandbox_open_phase();
REVOKE EXECUTE ON FUNCTION public.guard_sandbox_open_phase() FROM PUBLIC;
