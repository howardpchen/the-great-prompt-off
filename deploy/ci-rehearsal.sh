#!/usr/bin/env bash
set -euo pipefail
umask 077
# Destructive test flows are restricted to disposable CI checkouts.
[[ "${CI:-}" == "true" ]] || { echo 'Requires disposable CI checkout.' >&2; exit 1; }
[[ ! -e secrets ]] || { echo 'Refusing to overwrite existing secret directory.' >&2; exit 1; }
compose=(docker compose)
if [[ -n "${COMPOSE_BIN:-}" ]]; then compose=("$COMPOSE_BIN"); fi
export COMPOSE_PROJECT_NAME="prompt-off-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
# Generate throwaway fixture credentials directly to protected files, never argv/env.
node --input-type=module <<'JS'
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('secrets', { mode: 0o700 });
for (const name of ['db_owner_password', 'db_migrator_password', 'db_app_password', 'admin_secret', 'participant_secret']) {
  writeFileSync(`secrets/${name}`, randomBytes(48).toString('base64url'), { mode: 0o600, flag: 'wx' });
}
JS
setfacl -m u:999:r,u:1000:r secrets/*
# Always stop this fixture; preserve its DB for debugging until CI runner disposal.
trap '"${compose[@]}" stop app db >/dev/null 2>&1 || true' EXIT
"${compose[@]}" build app migrate
"${compose[@]}" up -d --wait db
"${compose[@]}" run --rm migrate
"${compose[@]}" run --rm -e SEED_DEMO=true -e EVENT_PHASE=practice_open migrate npm run seed:demo
"${compose[@]}" exec -T db psql -U postgres -d prompt_off -At -v ON_ERROR_STOP=1 \
  -c "SELECT access_code FROM participants WHERE participant_code = 'P001';" > secrets/e2e_access_code
test -s secrets/e2e_access_code
"${compose[@]}" up -d --wait app
curl --fail --silent http://localhost:3000/api/health/ready
export ADMIN_SECRET_FILE="$PWD/secrets/admin_secret"
export E2E_ACCESS_CODE_FILE="$PWD/secrets/e2e_access_code"
export E2E_ALLOW_MUTATIONS=true
export E2E_BASE_URL=http://localhost:3000
npm run test:e2e
bash deploy/backup.sh
backup_file=$(ls -t backups/*.dump | head -1)
bash deploy/restore-check.sh "$backup_file"
