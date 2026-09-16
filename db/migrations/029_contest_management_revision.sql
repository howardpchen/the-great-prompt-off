ALTER TABLE challenges ADD COLUMN management_revision integer NOT NULL DEFAULT 1;
CREATE FUNCTION public.bump_contest_management_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'management_revision'-'schema_locked') IS DISTINCT FROM (to_jsonb(OLD)-'management_revision'-'schema_locked') THEN
 NEW.management_revision := OLD.management_revision + 1;
 ELSE NEW.management_revision := OLD.management_revision; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER bump_contest_management_revision BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION public.bump_contest_management_revision();
REVOKE EXECUTE ON FUNCTION public.bump_contest_management_revision() FROM PUBLIC;
