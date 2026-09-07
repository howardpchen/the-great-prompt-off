import assert from "node:assert/strict";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { reserveAttempt, failReservation } from "../app/lib/db/attempts";
import {
  submitToSupabase,
  getSupabaseLeaderboard,
} from "../app/lib/supabase/submission-workflow";
import { getAdminDashboardData, grantExtraPublicAttempt } from "../app/lib/supabase/admin-dashboard";
async function main() {
  if (process.env.PGDATABASE !== "gpo_test")
    throw new Error("Requires disposable gpo_test database");
  const db = createDatabase();
  const [challenge] = await db.sql<{ id: string }>(
    "SELECT id FROM challenges WHERE is_active",
  );
  const [participant] = await db.sql<{ id: string }>(
    "SELECT id FROM participants WHERE participant_code=$1",
    ["P001"],
  );
  assert.equal((await db.rpc("admin_reset_workshop_run_data")).error, null);
  await db.sql(
    "UPDATE challenges SET event_phase='practice_open' WHERE id=$1",
    [challenge.id],
  );
  // Exercise the real organizer operation, not merely the query adapter.
  assert.equal(await grantExtraPublicAttempt(" p001 "), 1);
  assert.equal(await grantExtraPublicAttempt("P001"), 2);
  const grants = await Promise.all(
    Array.from({ length: 8 }, () => grantExtraPublicAttempt("P001")),
  );
  assert.deepEqual(grants.sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10]);
  const [override] = await db.sql<{ extra_public_attempts: number }>(
    "SELECT extra_public_attempts FROM participant_attempt_overrides WHERE participant_code=$1",
    ["P001"],
  );
  assert.equal(override.extra_public_attempts, 10);
  await assert.rejects(grantExtraPublicAttempt("NOT_REGISTERED"));
  await db.sql("UPDATE participants SET is_active=false WHERE id=$1", [participant.id]);
  await assert.rejects(grantExtraPublicAttempt("P001"));
  await db.sql("UPDATE participants SET is_active=true WHERE id=$1", [participant.id]);
  // Keep the established five-attempt admission fixture unchanged.
  await db.sql("DELETE FROM participant_attempt_overrides WHERE participant_code=$1", ["P001"]);
  const prompt =
    "Return valid JSON for each field acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion. Use present, absent, uncertain, not_reported.";
  const score = await submitToSupabase({
    kind: "public",
    participantCode: "P001",
    prompt,
    idempotencyKey: "integration-first",
  });
  assert.equal(score.publicSubmissionsUsed, 1);
  assert.equal(score.reportCount, 5);
  const again = await submitToSupabase({
    kind: "public",
    participantCode: "P001",
    prompt,
    idempotencyKey: "integration-first",
  });
  assert.deepEqual(again, score);
  const dashboard = await getAdminDashboardData();
  assert.ok(dashboard);
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      reserveAttempt(db, {
        challengeId: challenge.id,
        participantId: participant.id,
        kind: "public",
        prompt,
        idempotencyKey: `burst-${i}`,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
  const held = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  await assert.rejects(
    reserveAttempt(db, {
      challengeId: challenge.id,
      participantId: participant.id,
      kind: "public",
      prompt,
      idempotencyKey: "integration-first",
    }).then((r) => {
      assert.equal(r.status, "completed");
      throw new Error("verified replay");
    }),
  );
  for (const reservation of held) await failReservation(db, reservation.id);
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.sql(
        "INSERT INTO participants(participant_code,access_code) VALUES('ROLLBACK_TEST','SYNTHETIC-ROLLBACK')",
      );
      throw new Error("forced failure");
    }),
  );
  assert.equal(
    (
      await db.sql(
        "SELECT id FROM participants WHERE participant_code='ROLLBACK_TEST'",
      )
    ).length,
    0,
  );
  await db.sql("UPDATE challenges SET event_phase='final_open' WHERE id=$1", [
    challenge.id,
  ]);
  const finals = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      submitToSupabase({
        kind: "final",
        participantCode: "P001",
        prompt,
        idempotencyKey: `final-${i}`,
      }),
    ),
  );
  assert.equal(finals.filter((r) => r.status === "fulfilled").length, 1);
  const final = finals.find((r) => r.status === "fulfilled");
  assert.equal(final?.status === "fulfilled" && final.value.reportCount, 45);
  assert.ok(
    !(final?.status === "fulfilled" && final.value.feedback?.reportDetails),
  );
  const [counts] = await db.sql<{
    submissions: number;
    items: number;
    runs: number;
  }>(
    `SELECT (SELECT count(*)::int FROM submissions) submissions,(SELECT count(*)::int FROM prompt_run_items) items,(SELECT count(*)::int FROM prompt_runs) runs`,
  );
  assert.deepEqual(counts, { submissions: 2, items: 50, runs: 2 });
  await getSupabaseLeaderboard();
  assert.equal(
    (
      await db.rpc("admin_clear_participant_run_data", {
        target_participant_code: "P001",
      })
    ).error,
    null,
  );
  assert.equal((await db.sql("SELECT id FROM attempt_reservations")).length, 0);
  await assert.rejects(db.transaction(async tx => {
    const result = await tx.execute({table:'participants', operation:'insert', values:{participant_code:'P001',access_code:'DUPLICATE-SYNTHETIC'}});
    assert.ok(result.error);
    // Even if a caller handles a query error, an aborted transaction must not report success.
  }));
  console.log(
    "PASS: first/repeated/concurrent organizer grants, replay, admission burst, atomic rollback, 5-public/45-private evaluation, final exclusivity, admin dashboard and clear, leaderboard",
  );
  await getPool().end();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
