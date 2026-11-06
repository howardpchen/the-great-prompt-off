# Historical Supabase SQL

These files are retained for provenance and source-regression references only. The application now uses direct PostgreSQL through server-only `pg`; there is no browser Supabase client or service-role key requirement.

**Do not execute these files as the current migration procedure.** Apply only ordered, checksummed `db/migrations` with `npm run db:migrate`. Never edit an applied migration or replay an older schema over a populated event.

For setup, roles and fresh synthetic seeding see [database setup](../db/README.md). For application architecture see [PROJECT_ARCHITECTURE.md](../PROJECT_ARCHITECTURE.md); for backup/restore and container deployment see [deploy/README.md](../deploy/README.md).
