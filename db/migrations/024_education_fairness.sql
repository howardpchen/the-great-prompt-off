-- Keep legacy budget behavior; opt-in educational contracts freeze on admission.
CREATE FUNCTION public.guard_education_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF old.contest_schema #>> '{education,version}' = '1'
    AND (old.schema_locked OR EXISTS(SELECT 1 FROM attempt_reservations WHERE challenge_id=old.id))
    AND (old.public_submission_limit IS DISTINCT FROM new.public_submission_limit
      OR old.final_submission_limit IS DISTINCT FROM new.final_submission_limit
      OR old.locked_model IS DISTINCT FROM new.locked_model) THEN
   RAISE EXCEPTION 'Educational budgets and model are locked. Create a new contest version.' USING ERRCODE='55000';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER guard_education_budget BEFORE UPDATE ON challenges
 FOR EACH ROW EXECUTE FUNCTION public.guard_education_budget();
REVOKE EXECUTE ON FUNCTION public.guard_education_budget() FROM PUBLIC;
