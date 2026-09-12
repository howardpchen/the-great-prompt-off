/** Run only in an explicitly disposable, migrated and demo-seeded database. */
import assert from 'node:assert/strict';
import {createDatabase} from '../app/lib/db/database';
import {getPool} from '../app/lib/db/pool';
import {reserveAttempt,failReservation,recoverAbandonedReservation} from '../app/lib/db/attempts';
async function main(){
 if(process.env.PGDATABASE !== 'gpo_test') throw new Error('Requires disposable gpo_test database');
 const db=createDatabase();
 const [c]=await db.sql<{id:string}>("SELECT id FROM challenges WHERE is_active");
 const [p]=await db.sql<{id:string}>("SELECT id FROM participants WHERE participant_code='P001'");
 // Fresh child contest avoids editing frozen legacy fixtures.
 const [challenge]=await db.sql<{id:string}>(`INSERT INTO challenges(slug,title,locked_model,evaluation_model,mode_id,schema_version,output_schema,contest_schema,public_submission_limit,final_submission_limit,event_phase,is_active,schema_ready)
 SELECT 'fairness-' || gen_random_uuid()::text,title || ' fairness test',locked_model,'qwen/qwen3.5-9b',mode_id,schema_version,output_schema,
 jsonb_build_object('education',jsonb_build_object('version',1)),2,5,'practice_open',true,true FROM challenges WHERE id=$1 RETURNING id`,[c.id]);
 const input={challengeId:challenge.id,participantId:p.id,kind:'public' as const,prompt:'Use evidence'};
 await db.sql("INSERT INTO participant_attempt_overrides(participant_code,extra_public_attempts) VALUES('P001',20) ON CONFLICT(participant_code) DO UPDATE SET extra_public_attempts=20");
 const burst=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveAttempt(db,{...input,idempotencyKey:`edu-${i}`})));
 const held=burst.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 assert.equal(held.length,2,'team budget ignores overrides under concurrency');
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
 const final={...input,kind:'final' as const,idempotencyKey:'final-first'};
 const locked=await reserveAttempt(db,final);
 await assert.rejects(reserveAttempt(db,{...final,idempotencyKey:'final-second'}));
 await failReservation(db,locked.id);
 await assert.rejects(reserveAttempt(db,{...final,idempotencyKey:'changed-final',prompt:'Changed after failure'}));
 const retry=await reserveAttempt(db,final);assert.notEqual(retry.id,locked.id);
 await db.sql("UPDATE attempt_reservations SET status='completed',response='{}'::jsonb WHERE id=$1",[retry.id]);
 assert.equal((await reserveAttempt(db,final)).status,'completed');
 console.log('PASS education concurrent budgets, one-time refund, final lock, retry fencing, freeze');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
