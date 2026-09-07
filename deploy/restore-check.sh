#!/usr/bin/env bash
set -euo pipefail
umask 077
compose=(docker compose)
if [[ -n "${COMPOSE_BIN:-}" ]]; then compose=("$COMPOSE_BIN"); fi
# Restore only into a NEW, isolated database; never overwrite event state.
backup_file=${1:?Usage: deploy/restore-check.sh backups/file.dump}
restore_db="restore_check_$(date -u +%Y%m%d%H%M%S)"
test -s "$backup_file"
sha256sum --check "${backup_file}.sha256"
"${compose[@]}" exec -T db createdb -U postgres "$restore_db"
"${compose[@]}" exec -T db pg_restore -U postgres --exit-on-error -d "$restore_db" < "$backup_file"
"${compose[@]}" exec -T db psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS restored_tables FROM information_schema.tables WHERE table_schema = 'public';"
# Quiesce application writes before this check so source/restore fingerprints agree.
for check_db in prompt_off "$restore_db"; do
  "${compose[@]}" exec -T db psql -U postgres -d "$check_db" -At -v ON_ERROR_STOP=1 \
    < deploy/database-fingerprint.sql > "${backup_file}.${check_db}.fingerprint"
done
cmp "${backup_file}.prompt_off.fingerprint" "${backup_file}.${restore_db}.fingerprint"
printf '%s\n' "$restore_db" > "${backup_file}.restore-db"
printf 'All public-table row counts/content fingerprints match source.\n'
printf 'Restored successfully into isolated database %s; retain for app-level verification.\n' "$restore_db"
