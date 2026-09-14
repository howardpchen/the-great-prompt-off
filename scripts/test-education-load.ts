/** Local synthetic database exercise; never point at production. */
import assert from "node:assert/strict";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { contestSchemaState, saveContestSchema } from "../app/lib/db/contest-schema";
import { submitToSupabase } from "../app/lib/supabase/submission-workflow";
async function main() {
  if (process.env.PGDATABASE !== "gpo_edu_load" || process.env.USE_REAL_LLM !== "false") throw new Error("Requires disposable gpo_edu_load and explicit mock mode.");
  const db=createDatabase(); let state=await contestSchemaState(db);
  await saveContestSchema(db,{action:"fork",contestId:state.contestId,expectedVersion:state.schema.version});
  state=await contestSchemaState(db);
  assert.equal(state.schema.education?.version,1);
  const answers=state.reports.map(r=>({report_id_or_filename:r.id,answer_values:Object.fromEntries(state.schema.fields.map(f=>[f.key,f.type==="number"?f.minimum??0:f.allowedValues[0]]))}));
  await saveContestSchema(db,{action:"answers",contestId:state.contestId,expectedVersion:state.schema.version,answers});
  await db.sql("UPDATE challenges SET event_phase='practice_open',public_submission_limit=2 WHERE id=$1",[state.contestId]);
  const teams=await db.sql<{participant_code:string}>("SELECT participant_code FROM participants WHERE is_active ORDER BY participant_code LIMIT 50");assert.equal(teams.length,50);
  const prompt=state.schema.education!.baselineInstructions;
  const start=performance.now();
  const practice=await Promise.all(teams.map(t=>submitToSupabase({kind:"public",participantCode:t.participant_code,prompt,idempotencyKey:"edu-load-practice"})));
  const practiceMs=performance.now()-start;
  assert.ok(practice.every(s=>s.publicSubmissionsUsed===1&&s.kind==="public"));
  const repeats=await Promise.all(teams.map(t=>submitToSupabase({kind:"public",participantCode:t.participant_code,prompt,idempotencyKey:"edu-load-practice"})));
  assert.ok(repeats.every(s=>s.publicSubmissionsUsed===1));
  await db.sql("UPDATE challenges SET event_phase='final_open' WHERE id=$1",[state.contestId]);
  const finalStart=performance.now();
  const finals=await Promise.all(teams.map(t=>submitToSupabase({kind:"final",participantCode:t.participant_code,prompt,idempotencyKey:"edu-load-final"})));
  const finalMs=performance.now()-finalStart;
  assert.ok(finals.every(s=>s.finalSubmissionUsed&&s.finalScore===null&&s.score===null));
  const [counts]=await db.sql<{submissions:number,pending:number}>("SELECT (SELECT count(*)::int FROM submissions WHERE challenge_id=$1) submissions,(SELECT count(*)::int FROM attempt_reservations WHERE challenge_id=$1 AND status='pending') pending",[state.contestId]);
  assert.equal(counts.submissions,100);assert.equal(counts.pending,0);
  console.log(JSON.stringify({result:"PASS",teams:50,fields:state.schema.fields.length,reports:state.reports.length,practiceMs,finalMs,submissions:counts.submissions,pending:counts.pending,scope:"local simulated application/database burst; not HTTP or production capacity"}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
