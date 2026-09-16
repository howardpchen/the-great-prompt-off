import assert from "node:assert/strict";
import { Database, createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { readAdminPageSnapshot } from "../app/lib/db/admin-page-snapshot";
import { getAdminDashboardData } from "../app/lib/supabase/admin-dashboard";
import { submitToSupabase } from "../app/lib/supabase/submission-workflow";
import { mutateContestLibrary } from "../app/lib/db/contest-library";

async function main() {
  if (process.env.PGDATABASE !== "gpo_library_test" || process.env.USE_REAL_LLM !== "false" || process.env.TEST_ALLOW_MUTATIONS !== "true") throw new Error("Explicit disposable fixture only.");
  const db = new Database();
  const [a] = await db.sql<{id:string; schema_version:number}>("SELECT id,schema_version FROM challenges WHERE is_active");
  const [b] = await db.sql<{id:string; schema_version:number}>("SELECT id,schema_version FROM challenges WHERE NOT is_active AND schema_ready ORDER BY created_at LIMIT 1");
  assert.ok(a && b, "Run the contest-library synthetic fixture first");
  await db.sql("UPDATE challenges SET event_announcement=$2 WHERE id=$1", [a.id, "Snapshot A controls"]);
  await db.sql("UPDATE challenges SET event_announcement=$2 WHERE id=$1", [b.id, "Snapshot B controls"]);
  const snapshot = await readAdminPageSnapshot(async () => {
    const first = await getAdminDashboardData();
    assert.equal(first.overview.eventAnnouncement, "Snapshot A controls");
    // A separate connection commits activation between the page data read and
    // subordinate reads / later React frame rendering. No timers or sleeps.
    await mutateContestLibrary(db, { action: "activate", contestId: b.id, expectedVersion: b.schema_version });
    const second = await getAdminDashboardData();
    assert.equal(second.overview.eventAnnouncement, "Snapshot A controls");
    const [active] = await createDatabase().sql<{id:string}>("SELECT id FROM challenges WHERE is_active");
    assert.equal(active.id, a.id);
    return first;
  });
  const [now] = await db.sql<{id:string}>("SELECT id FROM challenges WHERE is_active");
  assert.equal(now.id, b.id);
  assert.equal(snapshot.contestContext?.id, a.id);
  assert.equal(snapshot.contestContext?.schema_version, a.schema_version);
  assert.equal(snapshot.data.overview.eventAnnouncement, "Snapshot A controls");
  const before = await db.sql("SELECT id,status FROM attempt_reservations ORDER BY id");
  await assert.rejects(submitToSupabase({kind:"public",participantCode:"P001",prompt:"Synthetic empty identity",expectedContestId:"",expectedSchemaVersion:b.schema_version}), /Contest changed/);
  assert.deepEqual(await db.sql("SELECT id,status FROM attempt_reservations ORDER BY id"), before);
  console.log('PASS empty supplied workflow identity rejects with unchanged reservations.');
  console.log("PASS deterministic activation between dashboard data and subordinate reads: returned content/fence remains A while database is B at render time.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => getPool().end());
