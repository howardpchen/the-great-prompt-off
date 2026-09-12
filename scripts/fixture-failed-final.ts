/** Browser acceptance setup only: emulate a drained infrastructure failure before scoring. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { reserveAttempt, failReservation } from "../app/lib/db/attempts";
import { getActiveChallenge } from "../app/lib/supabase/submission-workflow";
async function main() {
  assert.equal(process.env.E2E_ALLOW_MUTATIONS, "true");
  assert.equal(process.env.PGDATABASE, "prompt_off");
  assert.equal(process.env.PGHOST, "127.0.0.1");
  assert.equal(process.env.PGPORT, "55439");
  const db = createDatabase(); const challenge = await getActiveChallenge(db);
  const [counts] = await db.sql<{ n: number }>("SELECT count(*)::int n FROM reports WHERE challenge_id=$1 AND NOT synthetic", [challenge.id]);
  assert.equal(counts.n, 0, "Synthetic fixture only");
  const accessCode = readFileSync(process.env.E2E_ACCESS_CODE_FILE!, "utf8").trim();
  const [team] = await db.sql<{ id: string }>("SELECT id FROM participants WHERE access_code=$1 AND is_active", [accessCode]);
  assert.ok(team);
  const reservation = await reserveAttempt(db, { challengeId: challenge.id, participantId: team.id, kind: "final", prompt: "Recover these exact final instructions.\nUse explicit evidence, including negation.", idempotencyKey: "browser-infrastructure-failure" });
  await failReservation(db, reservation.id);
  console.log("Disposable failed-final fixture prepared; no evaluation or network call.");
}
main().catch(() => { console.error("Failed-final fixture setup failed"); process.exitCode = 1; }).finally(() => getPool().end());
