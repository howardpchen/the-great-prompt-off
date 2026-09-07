#!/usr/bin/env bash
set -euo pipefail
compose=(docker compose)
if [[ -n "${COMPOSE_BIN:-}" ]]; then compose=("$COMPOSE_BIN"); fi
# Restore only into a NEW, isolated database; never overwrite event state.
backup_file=${1:?Usage: deploy/restore-check.sh backups/file.dump}
restore_db="restore_check_$(date -u +%Y%m%d%H%M%S)"
test -s "$backup_file"
sha256sum --check "${backup_file}.sha256"
"${compose[@]}" exec -T db createdb -U postgres "$restore_db"
"${compose[@]}" exec -T db pg_restore -U postgres --no-owner --exit-on-error -d "$restore_db" < "$backup_file"
"${compose[@]}" exec -T db psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS restored_tables FROM information_schema.tables WHERE table_schema = 'public';"
printf 'Restored successfully into isolated database %s; retain for app-level verification.\n' "$restore_db"
