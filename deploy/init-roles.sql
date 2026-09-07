-- Empty-cluster initialization only; does not alter existing database roles.
-- Read secrets inside PostgreSQL: no values in command arguments or SQL text.
CREATE ROLE prompt_off_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE prompt_off_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
DO $$
BEGIN
  EXECUTE format('ALTER ROLE prompt_off_migrator PASSWORD %L',
    btrim(pg_read_file('/run/secrets/db_migrator_password')));
  EXECUTE format('ALTER ROLE prompt_off_app PASSWORD %L',
    btrim(pg_read_file('/run/secrets/db_app_password')));
END $$;
REVOKE ALL ON DATABASE prompt_off FROM PUBLIC;
GRANT CONNECT ON DATABASE prompt_off TO prompt_off_migrator, prompt_off_app;
ALTER SCHEMA public OWNER TO prompt_off_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO prompt_off_app;
ALTER DEFAULT PRIVILEGES FOR ROLE prompt_off_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prompt_off_app;
ALTER DEFAULT PRIVILEGES FOR ROLE prompt_off_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO prompt_off_app;
ALTER DEFAULT PRIVILEGES FOR ROLE prompt_off_migrator IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE prompt_off_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO prompt_off_app;
