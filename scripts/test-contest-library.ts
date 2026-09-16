import assert from "node:assert/strict";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { mutateContestLibrary, listContests } from "../app/lib/db/contest-library";
import { contestSchemaState, saveContestSchema } from "../app/lib/db/contest-schema";
import { twelveBinaryTemplate } from "../app/lib/contest-schema-fixtures";
import { reserveAttempt, failReservation } from "../app/lib/db/attempts";
import { readTeamHistory } from "../app/lib/db/team-history";
import {grantExtraPublicAttempt} from "../app/lib/supabase/admin-dashboard";
import { submitToSupabase } from "../app/lib/supabase/submission-workflow";
async function main() {
 if(process.env.PGDATABASE!=="gpo_library_test" || process.env.USE_REAL_LLM==="true") throw new Error("Disposable fixture only.");
 const db=createDatabase();
 const old=await contestSchemaState(db);
 const before=await db.sql("SELECT id,participant_code,access_code FROM participants ORDER BY id");
 // Two organizer tabs editing an already-ready legacy contest must not lose updates.
 const [legacy] = await db.sql<{contest_schema: unknown; schema_ready: boolean; schema_locked: boolean}>(
  "SELECT contest_schema,schema_ready,schema_locked FROM challenges WHERE id=$1", [old.contestId]);
 assert.equal(legacy.contest_schema, null);
 assert.equal(legacy.schema_ready, true);
 assert.equal(legacy.schema_locked, false);
 const legacyAnswers = (value: string) => old.reports.map(r => ({
  report_id_or_filename: r.id,
  answer_values: Object.fromEntries(old.schema.fields.map(f => [f.key, value])),
 }));
 const legacyImport = {action:'answers',contestId:old.contestId,expectedVersion:old.schema.version,expectedRevision:old.revision};
 const keysSnapshot = () => db.sql(
  "SELECT k.* FROM answer_keys k JOIN reports r ON r.id=k.report_id WHERE r.challenge_id=$1 ORDER BY k.id", [old.contestId]);
 await saveContestSchema(db,{...legacyImport,answers:legacyAnswers('absent')});
 const afterFirstImport = await contestSchemaState(db,old.contestId);
 assert.ok(afterFirstImport.revision > old.revision, 'Ready legacy answer import must advance revision');
 assert.equal(afterFirstImport.ready, true);
 const firstKeys = await keysSnapshot();
 await assert.rejects(saveContestSchema(db,{...legacyImport,answers:legacyAnswers('present')}), /Contest changed/);
 assert.deepEqual(await keysSnapshot(), firstKeys, 'Stale import must preserve every first-import answer');
 assert.deepEqual(await contestSchemaState(db,old.contestId), afterFirstImport);
 // A refreshed tab can save again; an invalid import rolls back keys AND revision.
 await saveContestSchema(db,{...legacyImport,expectedRevision:afterFirstImport.revision,answers:legacyAnswers('present')});
 const afterSecondImport = await contestSchemaState(db,old.contestId);
 assert.ok(afterSecondImport.revision > afterFirstImport.revision);
 const secondKeys = await keysSnapshot();
 await assert.rejects(saveContestSchema(db,{...legacyImport,expectedRevision:afterSecondImport.revision,answers:legacyAnswers('absent').slice(1)}), /Every practice/);
 assert.deepEqual(await keysSnapshot(), secondKeys);
 assert.deepEqual(await contestSchemaState(db,old.contestId), afterSecondImport);
 console.log('PASS legacy ready/null-schema import revision, stale overwrite rejection, fresh retry, invalid-import rollback.');

 const schema={...twelveBinaryTemplate,fields:twelveBinaryTemplate.fields.map(f=>({...f,type:'multiclass',allowedValues:['not_mentioned','absent','present'],allowNull:false})),education:{version:1,pipeline:'structured-v1',baselineInstructions:'Use report evidence; output the approved categorical decisions.'}};
 const created=await mutateContestLibrary(db,{action:'create',schema,title:'Synthetic 100 x 12',evaluationModel:'qwen/qwen3.5-9b',practiceBudget:3});
 let state=await contestSchemaState(db,created.contestId);
 assert.equal((await contestSchemaState(db)).contestId,old.contestId);
 const reports=Array.from({length:100},(_,i)=>({external_id:`S${i}`,filename:`synthetic-${i}.txt`,split:i<20?'public':'private',report_text:`Synthetic knee MRI fixture ${i}. Ligaments and menisci are intact. No effusion or fracture.`}));
 await assert.rejects(saveContestSchema(db,{action:'reports',contestId:state.contestId,expectedVersion:state.schema.version,reports:[...reports,reports[0]]}));
 assert.equal((await contestSchemaState(db,state.contestId)).reports.length,0);
 await saveContestSchema(db,{action:'reports',contestId:state.contestId,expectedVersion:state.schema.version,reports});
 state=await contestSchemaState(db,state.contestId);
 const answers=state.reports.map(r=>({report_id_or_filename:r.id,answer_values:Object.fromEntries(state.schema.fields.map(f=>[f.key,'not_mentioned']))}));
 await assert.rejects(saveContestSchema(db,{action:'answers',contestId:state.contestId,expectedVersion:state.schema.version,answers:answers.slice(1)}));
 assert.equal((await db.sql<{n:number}>("SELECT count(*)::int n FROM answer_keys k JOIN reports r ON r.id=k.report_id WHERE r.challenge_id=$1",[state.contestId]))[0].n,0);
 await saveContestSchema(db,{action:'answers',contestId:state.contestId,expectedVersion:state.schema.version,answers});
 assert.equal((await db.sql<{n:number}>("SELECT count(*)::int n FROM answer_keys k JOIN reports r ON r.id=k.report_id CROSS JOIN LATERAL jsonb_object_keys(k.answer_values) field WHERE r.challenge_id=$1",[state.contestId]))[0].n,1200);
 const [participant]=await db.sql<{id:string}>("SELECT id FROM participants WHERE participant_code='P001'");
 await db.sql("UPDATE challenges SET event_phase='practice_open' WHERE id=$1",[old.contestId]);
 const reservation=await reserveAttempt(db,{challengeId:old.contestId,participantId:participant.id,kind:'public',prompt:'Synthetic test',idempotencyKey:'old-worker'});
 await assert.rejects(mutateContestLibrary(db,{action:'activate',contestId:state.contestId,expectedVersion:state.schema.version}),/in-flight/);
 await failReservation(db,reservation.id);
 await submitToSupabase({kind:'public',participantCode:'P001',prompt:'Use explicit report evidence.',idempotencyKey:'old-completed'});
 await grantExtraPublicAttempt('P001');
 const races=await Promise.allSettled([
  reserveAttempt(db,{challengeId:old.contestId,participantId:participant.id,kind:'public',prompt:'Admission race',idempotencyKey:'race'}),
  mutateContestLibrary(db,{action:'activate',contestId:state.contestId,expectedVersion:state.schema.version})
 ]);
 if(races[0].status==='fulfilled') {assert.equal(races[1].status,'rejected');await failReservation(db,races[0].value.id);} else assert.equal(races[1].status,'fulfilled');
 await mutateContestLibrary(db,{action:'activate',contestId:state.contestId,expectedVersion:state.schema.version});
 await assert.rejects(submitToSupabase({kind:'public',participantCode:'P001',prompt:'Stale tab',expectedContestId:old.contestId,expectedSchemaVersion:old.schema.version}),/Contest changed/);
 await db.sql("UPDATE challenges SET event_phase='practice_open' WHERE id=$1",[state.contestId]);
 await assert.rejects(reserveAttempt(db,{challengeId:state.contestId,participantId:participant.id,kind:'public',prompt:'Stale version',expectedSchemaVersion:999}),/Contest changed/);
 const own=await reserveAttempt(db,{challengeId:state.contestId,participantId:participant.id,kind:'public',prompt:'New contest',expectedSchemaVersion:state.schema.version});
 assert.equal(own.attempt_number,1);await failReservation(db,own.id);
 assert.equal((await readTeamHistory(db,state.contestId,'P001'))!.practice.length,0);
 assert.equal((await readTeamHistory(db,old.contestId,'P001'))!.practice.length,1);
 assert.equal((await db.sql<{n:number}>("SELECT count(*)::int n FROM participant_attempt_overrides WHERE challenge_id=$1",[state.contestId]))[0].n,0);
 assert.equal((await db.sql<{n:number}>("SELECT extra_public_attempts n FROM participant_attempt_overrides WHERE challenge_id=$1 AND participant_code='P001'",[old.contestId]))[0].n,1);
 await assert.rejects(saveContestSchema(db,{action:'schema',contestId:state.contestId,expectedVersion:state.schema.version,schema}),/locked/);
 await assert.rejects(db.sql("UPDATE challenges SET is_active=true WHERE id=$1",[old.contestId]),/unique/);
 await Promise.all([mutateContestLibrary(db,{action:'activate',contestId:old.contestId,expectedVersion:old.schema.version}),mutateContestLibrary(db,{action:'activate',contestId:state.contestId,expectedVersion:state.schema.version})]);
 assert.equal((await db.sql<{n:number}>("SELECT count(*)::int n FROM challenges WHERE is_active"))[0].n,1);
 assert.deepEqual(await db.sql("SELECT id,participant_code,access_code FROM participants ORDER BY id"),before);
 assert.equal((await listContests(db)).length,2);
 await assert.rejects(mutateContestLibrary(db,{action:'archive',contestId:state.contestId,expectedVersion:999}),/changed/);
 await mutateContestLibrary(db,{action:'activate',contestId:old.contestId,expectedVersion:old.schema.version});
 await mutateContestLibrary(db,{action:'archive',contestId:state.contestId,expectedVersion:state.schema.version});
 console.log('PASS 100x12 atomic import, invalid rollback, inactive preservation, pending admission switching, single-active race/constraint, stale tabs/versions, scoped reservations/history, immutable attempted schema, accounts preserved.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
