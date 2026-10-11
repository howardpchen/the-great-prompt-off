/** Run only in an explicitly disposable, migrated and demo-seeded database. */
import assert from 'node:assert/strict';
import {twelveBinaryTemplate} from '../app/lib/contest-schema-fixtures';
import {buildOutputSchema} from '../app/lib/schema-storage';
import {createDatabase} from '../app/lib/db/database';
import {readTeamHistory} from '../app/lib/db/team-history';
import {getPool} from '../app/lib/db/pool';
import {grantExtraPublicAttempt,getAdminDashboardData} from '../app/lib/supabase/admin-dashboard';
import {getSupabaseSubmissionStatus} from '../app/lib/supabase/submission-workflow';
import {reserveAttempt,failReservation,recoverAbandonedReservation} from '../app/lib/db/attempts';
async function main(){
 if(process.env.PGDATABASE !== 'gpo_test') throw new Error('Requires disposable gpo_test database');
 const db=createDatabase();
 const [c]=await db.sql<{id:string}>("SELECT id FROM challenges WHERE is_active");
 const [p]=await db.sql<{id:string}>("SELECT id FROM participants WHERE participant_code='P001'");
 const mode={...twelveBinaryTemplate,education:{version:1 as const,pipeline:'structured-v1' as const,baselineInstructions:'Synthetic baseline',evaluationMode:'real' as const}};
 // Fresh child contest avoids editing frozen legacy fixtures.
 await db.sql("UPDATE challenges SET is_active=false WHERE id=$1",[c.id]);
 const [challenge]=await db.sql<{id:string}>(`INSERT INTO challenges(slug,title,locked_model,evaluation_model,mode_id,schema_version,output_schema,contest_schema,public_submission_limit,final_submission_limit,event_phase,is_active,schema_ready)
 SELECT 'fairness-' || gen_random_uuid()::text,title || ' fairness test',locked_model,'qwen/qwen3.5-9b',$2,$3,$4::jsonb,
 $5::jsonb,2,5,'practice_open',true,true FROM challenges WHERE id=$1 RETURNING id`,[c.id,mode.id,mode.version,JSON.stringify(buildOutputSchema(mode)),JSON.stringify(mode)]);
 const input={challengeId:challenge.id,participantId:p.id,kind:'public' as const,prompt:'Use evidence'};
 const [other]=await db.sql<{id:string}>("SELECT id FROM participants WHERE participant_code='P002'");
 // An override in a different contest must not affect this contest.
 await db.sql("INSERT INTO participant_attempt_overrides(challenge_id,participant_code,extra_public_attempts) VALUES($1,'P002',20) ON CONFLICT(challenge_id,participant_code) DO UPDATE SET extra_public_attempts=20",[c.id]);
 await assert.rejects(grantExtraPublicAttempt('MISSING'),/Participant not found/);
 await db.sql("UPDATE participants SET is_active=false WHERE id=$1",[other.id]);
 await assert.rejects(grantExtraPublicAttempt('P002'),/Reactivate/);
 await db.sql("UPDATE participants SET is_active=true WHERE id=$1",[other.id]);
 const burst=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveAttempt(db,{...input,idempotencyKey:`edu-${i}`})));
 const held=burst.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 assert.equal(held.length,2,'base budget holds under concurrency');
 assert.equal((await getSupabaseSubmissionStatus('P001')).remainingPublicSubmissions,0);
 assert.equal(await grantExtraPublicAttempt(' p001 '),1,'one grant belongs only to the selected participant');
 const status=await getSupabaseSubmissionStatus('P001');
 assert.equal(status.publicSubmissionLimit,3);
 assert.equal(status.extraPublicAttempts,1);
 assert.equal(status.remainingPublicSubmissions,1);
 const otherStatus=await getSupabaseSubmissionStatus('P002');
 assert.equal(otherStatus.publicSubmissionLimit,2);
 assert.equal(otherStatus.extraPublicAttempts,0);
 const dashboard=await getAdminDashboardData();
 assert.equal(dashboard.participants.find(row=>row.participantCode==='P001')?.extraPublicAttempts,1);
 assert.equal(dashboard.participants.find(row=>row.participantCode==='P002')?.extraPublicAttempts,0);
 const extraBurst=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveAttempt(db,{...input,idempotencyKey:`extra-${i}`})));
 assert.equal(extraBurst.filter(r=>r.status==='fulfilled').length,1,'+1 admits exactly one extra request under concurrency');
 const otherBurst=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveAttempt(db,{...input,participantId:other.id,idempotencyKey:`other-${i}`})));
 assert.equal(otherBurst.filter(r=>r.status==='fulfilled').length,2,'other participant keeps only the base budget');
 const grants=await Promise.all([grantExtraPublicAttempt('P001'),grantExtraPublicAttempt('P001')]);
 assert.deepEqual(grants.sort(),[2,3],'concurrent grants accumulate without lost updates');
 const more=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveAttempt(db,{...input,idempotencyKey:`more-${i}`})));
 assert.equal(more.filter(r=>r.status==='fulfilled').length,2);
 const [unchanged]=await db.sql<{public_submission_limit:number;final_submission_limit:number}>('SELECT public_submission_limit,final_submission_limit FROM challenges WHERE id=$1',[challenge.id]);
 assert.deepEqual(unchanged,{public_submission_limit:2,final_submission_limit:5},'grants never edit shared contest limits');
 assert.equal((await getSupabaseSubmissionStatus('P002')).publicSubmissionLimit,2);
 await assert.rejects(db.sql('UPDATE challenges SET public_submission_limit=99 WHERE id=$1',[challenge.id]));
 await failReservation(db,held[0].id);await failReservation(db,held[0].id);
 const replacement=await reserveAttempt(db,{...input,idempotencyKey:'after-refund'});
 await assert.rejects(reserveAttempt(db,{...input,idempotencyKey:'no-double-refund'}));
 await assert.rejects(recoverAbandonedReservation(db,replacement.id,false));
 assert.equal(await recoverAbandonedReservation(db,replacement.id,true),false,'fresh worker cannot recover');
 await db.sql("UPDATE attempt_reservations SET created_at=now()-interval '31 minutes' WHERE id=$1",[replacement.id]);
 assert.equal(await recoverAbandonedReservation(db,replacement.id,true),true);
 const retried=await reserveAttempt(db,{...input,idempotencyKey:'after-refund'});
 assert.notEqual(retried.id,replacement.id,'retry fences original worker');
 await failReservation(db,replacement.id);
 const [stillHeld]=await db.sql<{status:string}>('SELECT status FROM attempt_reservations WHERE id=$1',[retried.id]);
 assert.equal(stillHeld.status,'pending');
 await db.sql("UPDATE challenges SET event_phase='final_open' WHERE id=$1",[challenge.id]);
 const final={...input,prompt:'Exact final instructions\nPreserve whitespace.  ',kind:'final' as const,idempotencyKey:'final-first'};
 const locked=await reserveAttempt(db,final);
 await assert.rejects(reserveAttempt(db,{...final,idempotencyKey:'final-second'}));
 await failReservation(db,locked.id);
 const recovered=await readTeamHistory(db,challenge.id,'P001');
 assert.equal(recovered?.final?.instructions,final.prompt,'failed final text is recoverable from another browser');
 assert.equal(recovered?.final?.status,'failed');
 assert.equal((await readTeamHistory(db,challenge.id,'P002'))?.final,null,'other team cannot retrieve locked instructions');
 assert.equal(await readTeamHistory(db,challenge.id,'missing-team'),null);
 assert.equal((await readTeamHistory(db,c.id,'P001'))?.final?.instructions===final.prompt,false,'other contest cannot retrieve lock');

 await assert.rejects(reserveAttempt(db,{...final,idempotencyKey:'changed-final',prompt:'Changed after failure'}));
 const retry=await reserveAttempt(db,{...final,prompt:recovered!.final!.instructions!});assert.notEqual(retry.id,locked.id);
 await db.sql("UPDATE attempt_reservations SET status='completed',response='{}'::jsonb WHERE id=$1",[retry.id]);
 assert.equal((await reserveAttempt(db,final)).status,'completed');
 await db.sql('UPDATE challenges SET is_active=false WHERE id=$1',[challenge.id]);
 await assert.rejects(grantExtraPublicAttempt('P001'),/No active contest/);
 console.log('PASS participant-specific grants, status/admin display, concurrent grant/admission limits, contest isolation, education concurrent budgets, one-time refund, exact failed-final text recovery, team/contest isolation, original-lock retry, retry fencing, freeze');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
