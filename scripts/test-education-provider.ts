/** Database-integrated provider failure simulation. fetch is replaced before real-mode branch. */
import assert from "node:assert/strict";
import {createDatabase} from "../app/lib/db/database";
import {getPool} from "../app/lib/db/pool";
import {contestSchemaState,saveContestSchema} from "../app/lib/db/contest-schema";
import {submitToSupabase,getSupabaseSubmissionStatus} from "../app/lib/supabase/submission-workflow";
async function main(){
 if(process.env.PGDATABASE!=="gpo_edu_provider") throw new Error("Disposable gpo_edu_provider only.");
 const db=createDatabase();let state=await contestSchemaState(db);
 await saveContestSchema(db,{action:"fork",contestId:state.contestId,expectedVersion:state.schema.version});state=await contestSchemaState(db);
 await saveContestSchema(db,{action:"schema",contestId:state.contestId,expectedVersion:state.schema.version,schema:{...state.schema,education:{...state.schema.education,evaluationMode:"real"}}});state=await contestSchemaState(db);
 await saveContestSchema(db,{action:"answers",contestId:state.contestId,expectedVersion:state.schema.version,answers:state.reports.map(r=>({report_id_or_filename:r.id,answer_values:Object.fromEntries(state.schema.fields.map(f=>[f.key,f.allowedValues[0]]))}))});
 await db.sql("UPDATE challenges SET event_phase='practice_open' WHERE id=$1",[state.contestId]);
 let malformed=true,active=0;
 globalThis.fetch=async()=>{active++;await new Promise(r=>setTimeout(r,5));active--;return new Response(JSON.stringify({choices:[{message:{content:malformed?"{}":JSON.stringify(Object.fromEntries(state.schema.fields.map(f=>[f.key,{status:"no_decision",value:null}])))}}]}));};
 process.env.USE_REAL_LLM="true";process.env.OPENROUTER_API_KEY="fixture-only-no-network";
 const input={kind:"public" as const,participantCode:"P001",prompt:"Use explicit evidence",idempotencyKey:"provider-refund"};
 await assert.rejects(submitToSupabase(input));assert.equal(active,0,"all workers drained before refund");
 assert.equal((await getSupabaseSubmissionStatus("P001")).publicSubmissionsUsed,0);
 malformed=false;const result=await submitToSupabase(input);assert.equal(result.publicSubmissionsUsed,1);assert.equal(result.score,0);
 const [count]=await db.sql<{n:number}>("SELECT count(*)::int n FROM attempt_reservations WHERE challenge_id=$1 AND status='pending'",[state.contestId]);assert.equal(count.n,0);
 console.log("PASS malformed provider contract refunded after drain; valid no-decision scores zero and counts exactly once; no network calls");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
