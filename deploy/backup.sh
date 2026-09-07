#!/usr/bin/env bash
set -euo pipefail
compose=(docker compose)
if [[ -n "${COMPOSE_BIN:-}" ]]; then compose=("$COMPOSE_BIN"); fi
umask 077
# Run from the exact release directory; dump contains participant/session data.
mkdir -p backups
backup_file="backups/prompt-off-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Local Unix socket inside db container: no password in argv, env, or transcript.
"${compose[@]}" exec -T db pg_dump -U postgres -d prompt_off -Fc > "${backup_file}.partial"
test -s "${backup_file}.partial"
mv "${backup_file}.partial" "$backup_file"
sha256sum "$backup_file" > "${backup_file}.sha256"
printf 'Backup created: %s\n' "$backup_file"
