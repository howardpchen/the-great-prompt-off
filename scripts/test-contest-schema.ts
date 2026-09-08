import assert from "node:assert/strict";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import {
  contestSchemaState,
  saveContestSchema,
} from "../app/lib/db/contest-schema";
import {
  mixedTemplate,
  twelveBinaryTemplate,
} from "../app/lib/contest-schema-fixtures";
import { reserveAttempt, failReservation } from "../app/lib/db/attempts";
import { submitToSupabase } from "../app/lib/supabase/submission-workflow";
import {
  getAdminCaseManagerData,
  createAdminCase,
  updateAdminCase,
} from "../app/lib/supabase/admin-cases";
import { getAdminDashboardData } from "../app/lib/supabase/admin-dashboard";
async function main() {
  if (process.env.PGDATABASE !== "gpo_schema_test")
    throw new Error("Requires disposable gpo_schema_test database.");
  if (process.env.USE_REAL_LLM === "true")
    throw new Error("Real evaluation prohibited.");
  const db = createDatabase();
  const [participant] = await db.sql<{ id: string }>(
    "SELECT id FROM participants WHERE participant_code='P001'",
  );
  let state = await contestSchemaState(db);
  await saveContestSchema(db, {
    action: "schema",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    schema: twelveBinaryTemplate,
  });
  state = await contestSchemaState(db);
  assert.equal(state.schema.fields.length, 12);
  assert.equal(state.ready, false);
  await assert.rejects(
    db.sql("UPDATE challenges SET event_phase='practice_open' WHERE id=$1", [
      state.contestId,
    ]),
    /not ready/,
  );
  await assert.rejects(
    reserveAttempt(db, {
      challengeId: state.contestId,
      participantId: participant.id,
      kind: "public",
      prompt: "test",
      idempotencyKey: "not-ready",
    }),
    /not ready|not open/,
  );
  const answers = state.reports.map((r) => ({
    report_id_or_filename: r.id,
    answer_values: Object.fromEntries(
      state.schema.fields.map((f) => [f.key, "0"]),
    ),
  }));
  await assert.rejects(
    saveContestSchema(db, {
      action: "answers",
      contestId: state.contestId,
      expectedVersion: state.schema.version,
      answers: answers.slice(1),
    }),
    /Every/,
  );
  assert.equal(
    (
      await db.sql<{ n: number }>(
        "SELECT count(*)::int n FROM answer_keys WHERE mode_id=$1",
        [state.schema.id],
      )
    )[0].n,
    0,
  );
  await saveContestSchema(db, {
    action: "answers",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    answers,
  });
  assert.equal((await contestSchemaState(db)).ready, true);
  await db.sql(
    "UPDATE challenges SET event_phase='practice_open' WHERE id=$1",
    [state.contestId],
  );
  // Atomic admission prevents edits even while provider evaluation would be in flight.
  const held = await reserveAttempt(db, {
    challengeId: state.contestId,
    participantId: participant.id,
    kind: "public",
    prompt: "test",
    idempotencyKey: "freeze",
  });
  await assert.rejects(
    saveContestSchema(db, {
      action: "schema",
      contestId: state.contestId,
      expectedVersion: state.schema.version,
      schema: mixedTemplate,
    }),
    /locked/,
  );
  await assert.rejects(
    db.sql(
      "UPDATE answer_keys SET answer_values='{}'::jsonb WHERE report_id=$1 AND mode_id=$2",
      [state.reports[0].id, state.schema.id],
    ),
    /locked/,
  );
  await assert.rejects(
    db.sql("UPDATE reports SET report_text='changed' WHERE id=$1", [
      state.reports[0].id,
    ]),
    /locked/,
  );
  await failReservation(db, held.id);
  await assert.rejects(
    saveContestSchema(db, {
      action: "schema",
      contestId: state.contestId,
      expectedVersion: state.schema.version,
      schema: mixedTemplate,
    }),
    /locked/,
  );
  const strong = state.schema.fields.map((f) => f.label).join(" ");
  const score = await submitToSupabase({
    kind: "public",
    participantCode: "P001",
    prompt: strong,
    idempotencyKey: "twelve-complete",
  });
  assert.ok(score);
  const oldId = state.contestId;
  const oldRuns = (
    await db.sql<{ n: number }>(
      "SELECT count(*)::int n FROM prompt_runs WHERE challenge_id=$1",
      [oldId],
    )
  )[0].n;
  await saveContestSchema(db, {
    action: "fork",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
  });
  state = await contestSchemaState(db);
  assert.notEqual(state.contestId, oldId);
  assert.equal(state.ready, false);
  assert.equal(
    (
      await db.sql<{ n: number }>(
        "SELECT count(*)::int n FROM prompt_runs WHERE challenge_id=$1",
        [oldId],
      )
    )[0].n,
    oldRuns,
  );
  await saveContestSchema(db, {
    action: "schema",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    schema: mixedTemplate,
  });
  state = await contestSchemaState(db);
  const mixedAnswers = state.reports.map((r) => ({
    report_id_or_filename: r.id,
    answer_values: Object.fromEntries(
      state.schema.fields.map((f) => [
        f.key,
        f.type === "number" ? 10 : f.allowedValues[0],
      ]),
    ),
  }));
  const bad = structuredClone(mixedAnswers);
  bad[0].answer_values.measurement_1 = "10";
  await assert.rejects(
    saveContestSchema(db, {
      action: "answers",
      contestId: state.contestId,
      expectedVersion: state.schema.version,
      answers: bad,
    }),
    /invalid/,
  );
  await saveContestSchema(db, {
    action: "answers",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    answers: mixedAnswers,
  });
  // Existing editor can create and update a mixed numeric case without hardcoded labels.
  const caseAnswers = mixedAnswers[0].answer_values;
  await createAdminCase({
    filename: "mixed-new.txt",
    split: "public",
    reportText: "Synthetic test: measurement 10 mm.",
    answerKey: caseAnswers,
  });
  const cases = await getAdminCaseManagerData();
  assert.equal(cases.fields.length, 12);
  const created = cases.cases.find((c) => c.filename === "mixed-new.txt")!;
  assert.equal(created.answerKey?.measurement_1, 10);
  await updateAdminCase({
    reportId: created.id,
    filename: created.filename,
    split: "public",
    reportText: "Synthetic changed report.",
    answerKey: caseAnswers,
  });
  // Report changes invalidate readiness until full answer revalidation.
  state = await contestSchemaState(db);
  assert.equal(state.ready, false);
  await saveContestSchema(db, {
    action: "answers",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    answers: state.reports.map((r) => ({
      report_id_or_filename: r.id,
      answer_values: caseAnswers,
    })),
  });
  await db.sql(
    "UPDATE challenges SET event_phase='practice_open' WHERE id=$1",
    [state.contestId],
  );
  const result = await submitToSupabase({
    kind: "public",
    participantCode: "P001",
    prompt: state.schema.fields.map((f) => f.label).join(" "),
    idempotencyKey: "mixed-complete",
  });
  assert.ok(result);
  const [latest] = await db.sql<{
    overall_score: number;
    schema_snapshot: { fields: unknown[] };
  }>(
    "SELECT overall_score,schema_snapshot FROM prompt_runs WHERE challenge_id=$1 ORDER BY created_at DESC LIMIT 1",
    [state.contestId],
  );
  assert.equal(latest.overall_score, 100);
  assert.equal(latest.schema_snapshot.fields.length, 12);
  const weighted = await submitToSupabase({
    kind: "public",
    participantCode: "P001",
    prompt: state.schema.fields
      .slice(0, 8)
      .map((f) => f.label)
      .join(" "),
    idempotencyKey: "mixed-weighted",
  });
  assert.ok(Math.abs(weighted.score - (100 * 13) / 14) < 1e-8);
  const dashboard = await getAdminDashboardData();
  assert.equal(dashboard.overview.testSubmissionsCount, 2); // Excludes archived binary contest.
  // Concurrent schema save and admission cannot both succeed with different schemas.
  await saveContestSchema(db, {
    action: "fork",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
  });
  state = await contestSchemaState(db);
  await saveContestSchema(db, {
    action: "answers",
    contestId: state.contestId,
    expectedVersion: state.schema.version,
    answers: state.reports.map((r) => ({
      report_id_or_filename: r.id,
      answer_values: caseAnswers,
    })),
  });
  await db.sql(
    "UPDATE challenges SET event_phase='practice_open' WHERE id=$1",
    [state.contestId],
  );
  const race = await Promise.allSettled([
    reserveAttempt(db, {
      challengeId: state.contestId,
      participantId: participant.id,
      kind: "public",
      prompt: "race",
      idempotencyKey: "schema-race",
    }),
    saveContestSchema(db, {
      action: "schema",
      contestId: state.contestId,
      expectedVersion: state.schema.version,
      schema: mixedTemplate,
    }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.rpc("admin_reset_workshop_run_data")).error, null);
  assert.equal(
    (
      await db.sql<{ n: number }>(
        "SELECT count(*)::int n FROM prompt_runs WHERE challenge_id=$1",
        [oldId],
      )
    )[0].n,
    oldRuns,
  );

  console.log(
    "PASS: 12 binary and mixed 5/5/2 submission, atomic import/rollback, numeric editing, readiness, first-attempt freeze, immutable answers/reports, fork preserves history, run snapshots, weighted persisted scoring, scoped dashboard and concurrent schema/admission race.",
  );
  await getPool().end();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Test failed");
  process.exitCode = 1;
  void getPool().end();
});
