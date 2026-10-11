/** Isolated gpo_test only. No network or paid model requests. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createDatabase} from '../app/lib/db/database';
import {failReservation} from '../app/lib/db/attempts';
import {getPool} from '../app/lib/db/pool';
import {enqueuePublicSubmission,getSupabaseSubmissionStatus} from '../app/lib/supabase/submission-workflow';
import {createParticipantSessionToken} from '../app/lib/supabase/participant-session-token';
import {GET} from '../app/api/submissions/public/progress/route';
async function main(){
 if(process.env.PGDATABASE!=='gpo_test')throw Error('Requires disposable gpo_test');
 process.env.USE_REAL_LLM='false';delete process.env.OPENROUTER_API_KEY;
 process.env.ADMIN_SECRET=randomBytes(32).toString('hex');process.env.PARTICIPANT_SESSION_SECRET=randomBytes(32).toString('hex');
 delete process.env.ADMIN_SECRET_FILE;delete process.env.PARTICIPANT_SESSION_SECRET_FILE;
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected network request in isolated queue test');};
 try {
 const db=createDatabase();const [contest]=await db.sql<{id:string;schema_version:number}>('SELECT id,schema_version FROM challenges WHERE is_active');
 const tasks:Array<()=>Promise<void>>=[];
 const input={participantCode:'P001',prompt:'Use explicit findings and the exact output schema.',idempotencyKey:'queued-one',expectedContestId:contest.id,expectedSchemaVersion:contest.schema_version};
 const before=await getSupabaseSubmissionStatus('P001');
 const receipts=await Promise.all(Array.from({length:8},()=>enqueuePublicSubmission(input,task=>tasks.push(task))));
 assert.equal(tasks.length,1,'duplicate requests schedule only one execution');assert.ok(receipts.every(r=>r.state==='queued'));
 await assert.rejects(enqueuePublicSubmission({...input,prompt:'Different instructions'},task=>tasks.push(task)),/different prompt/);
 const read=(code='P001',key=input.idempotencyKey,id=contest.id)=>GET(new Request(`http://localhost/api/submissions/public/progress?contestId=${id}&requestId=${key}`,{headers:{Authorization:`Bearer ${createParticipantSessionToken(code)}`}}));
 const queued=await read();assert.equal(queued.status,200);assert.equal((await queued.json()).state,'queued');assert.equal(queued.headers.get('cache-control'),'no-store');
 assert.equal((await read('P002')).status,404,'other participant cannot see this request');
 assert.equal((await read('P001',input.idempotencyKey,randomUUID())).status,404,'other contest cannot see request');
 assert.equal((await GET(new Request('http://localhost/api/submissions/public/progress'))).status,401);
 assert.equal((await getSupabaseSubmissionStatus('P001')).remainingPublicSubmissions,before.remainingPublicSubmissions-1);
 await tasks[0]();
 const complete=await (await read()).json();assert.equal(complete.state,'completed');assert.equal(complete.result.kind,'public');assert.equal(complete.instructions,input.prompt);
 assert.equal(complete.result.publicSubmissionsUsed,before.publicSubmissionsUsed+1);
 assert.equal((await enqueuePublicSubmission(input,task=>tasks.push(task))).state,'completed');assert.equal(tasks.length,1);
 const [count]=await db.sql<{n:number}>("SELECT count(*)::int n FROM submissions WHERE challenge_id=$1",[contest.id]);assert.equal(count.n,1,'result stored exactly once');
 process.env.USE_REAL_LLM='true';
 await enqueuePublicSubmission({...input,idempotencyKey:'queued-failed'},task=>tasks.push(task));await tasks[1]();
 const failure=await (await read('P001','queued-failed')).json();assert.equal(failure.state,'failed');assert.match(failure.error,/No test attempt was used/);
 assert.equal((await getSupabaseSubmissionStatus('P001')).remainingPublicSubmissions,before.remainingPublicSubmissions-1,'failed evaluation refunds only itself');
 process.env.USE_REAL_LLM='false';
 await enqueuePublicSubmission({...input,idempotencyKey:'queued-stalled'},task=>tasks.push(task));
 await db.sql("UPDATE attempt_reservations SET created_at=now()-interval '26 minutes' WHERE idempotency_key='queued-stalled'");
 assert.equal((await (await read('P001','queued-stalled')).json()).state,'stalled');
 const [stalled]=await db.sql<{status:string}>("SELECT status FROM attempt_reservations WHERE idempotency_key='queued-stalled'");assert.equal(stalled.status,'pending','read-only polling never blindly refunds/replays unknown work');
 await tasks[2]();
 // Even knowing a final request key must not expose its cached private response.
 await db.sql("INSERT INTO attempt_reservations(challenge_id,participant_id,kind,idempotency_key,prompt_hash,attempt_number,status,response) SELECT $1,id,'final','secret-final','hash',1,'completed','{\"private\":\"must-not-leak\"}'::jsonb FROM participants WHERE participant_code='P001'",[contest.id]);
 assert.equal((await read('P001','secret-final')).status,404);
 // Format failures persist only a safe code, survive refresh, and refund once.
 await enqueuePublicSubmission({...input,idempotencyKey:'queued-format'},task=>tasks.push(task));
 const [formatReservation]=await db.sql<{id:string}>("SELECT id FROM attempt_reservations WHERE idempotency_key='queued-format'");
 await failReservation(db,formatReservation.id,'output_format');
 await failReservation(db,formatReservation.id,'evaluation_failed');
 const formatFailure=await (await read('P001','queued-format')).json();
 assert.equal(formatFailure.code,'output_format');assert.match(formatFailure.error,/required JSON format/);assert.match(formatFailure.error,/No test attempt was used/);
 console.log('PASS queued admission,8-way deduplication,progress,completion,replay,refund,participant/contest/final isolation,stalled-worker fencing; zero provider calls');
 } finally {globalThis.fetch=originalFetch;}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
