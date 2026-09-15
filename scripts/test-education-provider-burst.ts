/** EDU-15: disposable DB + actual submission workflow + fully stubbed provider.
 * Seed a fresh migrated gpo_edu_provider_burst first; never targets a live DB.
 * NODE_OPTIONS=--conditions=react-server tsx scripts/test-education-provider-burst.ts
 * Uses the real-mode application branch, but replaces fetch before any submission.
 */
import assert from "node:assert/strict";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { contestSchemaState, saveContestSchema } from "../app/lib/db/contest-schema";
import { twelveBinaryTemplate } from "../app/lib/contest-schema-fixtures";
import { submitToSupabase, getSupabaseSubmissionStatus } from "../app/lib/supabase/submission-workflow";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  if (process.env.PGDATABASE !== "gpo_edu_provider_burst" || process.env.DATABASE_URL)
    throw new Error("Requires fresh disposable gpo_edu_provider_burst; DATABASE_URL forbidden.");
  const db = createDatabase();
  let state = await contestSchemaState(db);
  await forkAndSelectFixture(db,state);
  state = await contestSchemaState(db);
  await saveContestSchema(db, { action: "schema", contestId: state.contestId, expectedVersion: state.schema.version,
    schema: { ...twelveBinaryTemplate, education: { version: 1, pipeline: "structured-v1", evaluationMode: "real", baselineInstructions: "Use explicit report evidence." } } });
  state = await contestSchemaState(db);
  await saveContestSchema(db, { action: "answers", contestId: state.contestId, expectedVersion: state.schema.version,
    answers: state.reports.map(r => ({ report_id_or_filename: r.id, answer_values: Object.fromEntries(state.schema.fields.map(f => [f.key, f.allowedValues[0]])) })) });
  await db.sql("UPDATE challenges SET event_phase='practice_open',public_submission_limit=2,evaluation_model='qwen/qwen3.5-9b' WHERE id=$1", [state.contestId]);
  const teams = await db.sql<{ participant_code: string }>("SELECT participant_code FROM participants WHERE is_active ORDER BY participant_code LIMIT 50");
  assert.equal(teams.length, 50);
  const cap = 4;
  process.env.OPENROUTER_CONCURRENCY = String(cap);
  process.env.OPENROUTER_API_KEY = "fixture-only-no-network";
  process.env.USE_REAL_LLM = "true";
  let active = 0, peak = 0, calls = 0, malformed = 0;
  let injectFailures = true;
  const teamActive = new Map<string, number>(), teamCalls = new Map<string, number>();
  const failedCallCount = new Map<string, number>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{content: string}>; response_format: {type: string} };
    assert.equal(body.model, "qwen/qwen3.5-9b");
    assert.equal(body.response_format.type, "json_schema");
    const marker = body.messages.map(m => m.content).join("\n").match(/TEST_TEAM:(P\d+) MODE:(fail|abstain|success)/);
    assert.ok(marker);
    const [, team, mode] = marker;
    calls++; active++; peak = Math.max(peak, active);
    assert.ok(active <= cap, `global provider in-flight exceeded ${cap}`);
    teamActive.set(team, (teamActive.get(team) || 0) + 1);
    const n = (teamCalls.get(team) || 0) + 1; teamCalls.set(team, n);
    const bad = injectFailures && mode === "fail" && n === 1;
    if (bad) malformed++;
    // Delay BODY completion, not just response headers: limiter/drain must cover both.
    await sleep(5);
    const response = new Response();
    response.json = async () => {
      try {
        await sleep(bad ? 5 : 35);
        const content = bad ? "{}" : JSON.stringify(Object.fromEntries(state.schema.fields.map(f => [f.key,
          mode === "abstain" ? { status: "no_decision", value: null } : { status: "decision", value: f.allowedValues[0] }])));
        return { choices: [{ message: { content } }] };
      } finally { active--; teamActive.set(team, teamActive.get(team)! - 1); }
    };
    return response;
  };
  const prompts = teams.map((t, i) => `Use explicit report evidence. TEST_TEAM:${t.participant_code} MODE:${i < 10 ? "fail" : i < 30 ? "abstain" : "success"}`);
  const started = performance.now();
  try {
    const initial = await Promise.allSettled(teams.map(async (t, i) => {
      try { return await submitToSupabase({kind: "public", participantCode: t.participant_code, prompt: prompts[i], idempotencyKey: "burst-practice"}); }
      catch (error) {
        assert.equal(teamActive.get(t.participant_code), 0, "all team provider workers must drain before rejection/refund");
        failedCallCount.set(t.participant_code, teamCalls.get(t.participant_code)!);
        throw error;
      }
    }));
    const practiceMs = performance.now() - started;
    assert.equal(initial.filter(r => r.status === "rejected").length, 10);
    assert.equal(malformed, 10); assert.equal(active, 0); assert.equal(peak, cap);
    for (let i = 0; i < teams.length; i++) {
      const status = await getSupabaseSubmissionStatus(teams[i].participant_code);
      assert.equal(status.publicSubmissionsUsed, i < 10 ? 0 : 1);
      if (i >= 10 && i < 30) {
        const result = initial[i]; assert.equal(result.status, "fulfilled");
        if (result.status === "fulfilled") assert.equal(result.value.score, 0, "valid abstentions count and score zero");
      }
    }
    for (const [team, n] of failedCallCount) assert.equal(teamCalls.get(team), n, "no late provider work after refund");
    injectFailures = false;
    const retryStart = performance.now();
    await Promise.all(teams.slice(0, 10).map((t, i) => submitToSupabase({kind: "public", participantCode: t.participant_code, prompt: prompts[i], idempotencyKey: "burst-practice"})));
    const retryMs = performance.now() - retryStart;
    const callsBeforeReplay = calls;
    await Promise.all(teams.map((t, i) => submitToSupabase({kind: "public", participantCode: t.participant_code, prompt: prompts[i], idempotencyKey: "burst-practice"})));
    assert.equal(calls, callsBeforeReplay, "idempotent replay must not invoke provider");
    await db.sql("UPDATE challenges SET event_phase='final_open' WHERE id=$1", [state.contestId]);
    const finalStart = performance.now();
    const finals = await Promise.all(teams.map((t, i) => submitToSupabase({kind: "final", participantCode: t.participant_code, prompt: prompts[i], idempotencyKey: "burst-final"})));
    const finalMs = performance.now() - finalStart;
    assert.ok(finals.every(r => r.finalSubmissionUsed && r.score === null && r.finalScore === null));
    assert.equal(active, 0);
    const [counts] = await db.sql<{submissions: number; pending: number}>("SELECT (SELECT count(*)::int FROM submissions WHERE challenge_id=$1) submissions, (SELECT count(*)::int FROM attempt_reservations WHERE challenge_id=$1 AND status='pending') pending", [state.contestId]);
    assert.equal(counts.submissions, 100); assert.equal(counts.pending, 0);
    for (const t of teams) assert.equal((await getSupabaseSubmissionStatus(t.participant_code)).publicSubmissionsUsed, 1);
    console.log(JSON.stringify({result: "PASS", teams: 50, fields: state.schema.fields.length, reports: state.reports.length,
      cap, peak, providerCalls: calls, malformed, refundedTeams: 10, scoredAbstentionTeams: 20,
      practiceMs, retryMs, finalMs, totalMs: performance.now() - started, ...counts,
      scope: "single-process direct application/database integration; stubbed provider with delayed bodies; no HTTP/production/real-model capacity claim"}));
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => getPool().end());

// Legacy regression fixture requires an active unready draft to exercise low-level guards.
// Production forks stay inactive; production activation is readiness-gated (test-contest-library).
async function forkAndSelectFixture(db: ReturnType<typeof createDatabase>, state: Awaited<ReturnType<typeof contestSchemaState>>) {
 const created=await saveContestSchema(db,{action:"fork",contestId:state.contestId,expectedVersion:state.schema.version});
 await db.transaction(async tx=>{await tx.sql("SELECT pg_advisory_xact_lock(718204,1)");await tx.sql("UPDATE challenges SET is_active=false WHERE is_active");await tx.sql("UPDATE challenges SET is_active=true WHERE id=$1",[created.contestId]);});
}
