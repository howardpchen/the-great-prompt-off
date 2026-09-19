import "server-only";
import { expireSandboxJobs } from "./sandbox";
import { randomUUID } from "node:crypto";
import type { Database } from "./database";
import { validateContestSchema } from "../contest-schema";
import { buildOutputSchema, resolveChallengeMode, validateAnswerValues } from "../schema-storage";
import { isApprovedEvaluationModel } from "../model-options";

export async function listContests(db: Database) {
  return db.sql(`SELECT c.id,c.title,c.is_active,c.event_phase,c.schema_version,c.schema_ready,c.schema_locked,c.archived_at,
    c.evaluation_model,c.public_submission_limit,c.final_submission_limit,
    (SELECT count(*)::int FROM reports r WHERE r.challenge_id=c.id) report_count,
    (SELECT count(*)::int FROM submissions s WHERE s.challenge_id=c.id) submission_count
    FROM challenges c ORDER BY c.created_at DESC,c.id`);
}

export async function mutateContestLibrary(db: Database, input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Invalid contest request.');
  const p = input as {action:string; contestId:string; expectedVersion:number; expectedRevision?:number; schema:unknown; title:string; evaluationModel:string; practiceBudget:number; sandboxEnabled?:boolean; sampleIds?:string[]};
  return db.transaction(async tx => {
    // Same lock as participant admission. Check pending work only after taking it.
    await tx.sql('SELECT pg_advisory_xact_lock(718204,1)');
    if (p.action === 'create') {
      if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 200) throw new Error('Supply a contest title.');
      if (!isApprovedEvaluationModel(p.evaluationModel)) throw new Error('Select an approved fixed model.');
      if (!Number.isInteger(p.practiceBudget) || p.practiceBudget < 1 || p.practiceBudget > 100) throw new Error('Practice budget must be 1–100.');
      const id=randomUUID();
      const schema=validateContestSchema({...validateContestSchema(p.schema),id:`contest_${id.replaceAll('-','')}`,version:1,title:p.title});
      await tx.sql(`INSERT INTO challenges(id,slug,title,description,output_schema,locked_model,evaluation_model,mode_id,schema_version,contest_schema,schema_ready,public_submission_limit,final_submission_limit,is_active,event_phase)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$6,$7,1,$8::jsonb,false,$9,1,false,'not_started')`,
        [id,`contest-${id}`,p.title,schema.description??'',JSON.stringify(buildOutputSchema(schema)),p.evaluationModel,schema.id,JSON.stringify(schema),p.practiceBudget]);
      return {ok:true,contestId:id};
    }
    const [c]=await tx.sql<{id:string;mode_id:string;contest_schema:unknown;schema_version:number;schema_ready:boolean;is_active:boolean;event_phase:string;management_revision:number;schema_locked:boolean;archived_at:string|null}>(
      'SELECT id,mode_id,contest_schema,schema_version,schema_ready,is_active,event_phase,management_revision,schema_locked,archived_at FROM challenges WHERE id=$1 FOR UPDATE',[p.contestId]);
    if (!c || c.schema_version!==p.expectedVersion || (p.expectedRevision!==undefined && p.expectedRevision!==c.management_revision)) throw new Error('Contest changed; reload before saving.');
    if(p.action==='sandbox') {
      if(c.archived_at || typeof p.sandboxEnabled!=='boolean' || !resolveChallengeMode(c.mode_id,c.schema_version,c.contest_schema).education) throw new Error('Educational non-archived contest required.');
      await expireSandboxJobs(tx);
      if((await tx.sql("SELECT id FROM sandbox_jobs WHERE challenge_id=$1 AND status='running'",[c.id])).length) throw new Error('Wait for in-flight sandbox work.');
      if(p.sampleIds!==undefined) {
        if(c.schema_locked || c.event_phase!=='not_started' || (await tx.sql('SELECT id FROM attempt_reservations WHERE challenge_id=$1 LIMIT 1',[c.id])).length || (await tx.sql('SELECT id FROM sandbox_jobs WHERE challenge_id=$1 LIMIT 1',[c.id])).length) throw new Error('Repartition only a paused unused contest; create a new version to preserve scores.');
        if(!Array.isArray(p.sampleIds) || p.sampleIds.length!==3 || new Set(p.sampleIds).size!==3) throw new Error('Choose exactly three sample reports.');
        const valid=await tx.sql("SELECT id FROM reports WHERE challenge_id=$1 AND id=ANY($2::uuid[]) AND split IN ('sample','private')",[c.id,p.sampleIds]);
        if(valid.length!==3)throw new Error('Samples must come from this contest’s held-out pool.');
        await tx.sql("UPDATE reports SET split='private' WHERE challenge_id=$1 AND split='sample'",[c.id]);
        await tx.sql("UPDATE reports SET split='sample' WHERE challenge_id=$1 AND id=ANY($2::uuid[])",[c.id,p.sampleIds]);
      }
      // Split triggers invalidate readiness; validate existing scored keys without rewriting references.
      if(p.sampleIds!==undefined && c.schema_ready) {
        const mode=resolveChallengeMode(c.mode_id,c.schema_version,c.contest_schema);
        const scored=await tx.sql<{split:string;answer_values:unknown}>("SELECT r.split,k.answer_values FROM reports r LEFT JOIN answer_keys k ON k.report_id=r.id AND k.mode_id=$2 AND k.schema_version=$3 WHERE r.challenge_id=$1 AND r.split IN ('public','private')",[c.id,mode.id,mode.version]);
        if(!scored.some(r=>r.split==='public') || !scored.some(r=>r.split==='private'))throw new Error('Scored practice and hidden reports must remain.');
        for(const r of scored)validateAnswerValues(r.answer_values,mode);
        await tx.sql('UPDATE challenges SET schema_ready=true WHERE id=$1',[c.id]);
      }
      const [count]=await tx.sql<{n:number}>("SELECT count(*)::int n FROM reports WHERE challenge_id=$1 AND split='sample'",[c.id]);
      if(p.sandboxEnabled && count.n!==3)throw new Error('Exactly three samples required before enabling.');
      await tx.sql('UPDATE challenges SET sandbox_enabled=$2,updated_at=now() WHERE id=$1',[c.id,p.sandboxEnabled]);
      return {ok:true,contestId:c.id};
    }
    if(p.action==='settings') {
      await expireSandboxJobs(tx);
      if ((await tx.sql("SELECT id FROM sandbox_jobs WHERE challenge_id=$1 AND status='running' LIMIT 1",[c.id])).length) throw new Error('Wait for in-flight sandbox work before editing.');
      if(c.schema_locked || c.archived_at) throw new Error('Locked/archived contest settings cannot change.');
      if(!isApprovedEvaluationModel(p.evaluationModel) || !Number.isInteger(p.practiceBudget) || p.practiceBudget<1 || p.practiceBudget>100) throw new Error('Select approved model and practice budget 1–100.');
      await tx.sql("UPDATE challenges SET evaluation_model=$2,locked_model=$2,public_submission_limit=$3,event_phase='not_started',updated_at=now() WHERE id=$1",[c.id,p.evaluationModel,p.practiceBudget]);
      return {ok:true,contestId:c.id};
    }
    if (p.action!=='activate'  && p.action!=='archive') throw new Error('Unsupported library action.');
    await expireSandboxJobs(tx);
    const pending=await tx.sql("SELECT id FROM attempt_reservations WHERE status='pending' UNION ALL SELECT id FROM sandbox_jobs WHERE status='running' LIMIT 1");
    if (pending.length) throw new Error('Wait for in-flight evaluations to finish before switching contests.');
    if (p.action==='activate') {
      if (!c.schema_ready) throw new Error('Contest must be structurally ready before activation.');
      const schema=resolveChallengeMode(c.mode_id,c.schema_version,c.contest_schema);
      const counts=await tx.sql<{split:string;n:number}>("SELECT split,count(*)::int n FROM reports WHERE challenge_id=$1 AND split IN ('public','private') GROUP BY split",[c.id]);
      if(counts.length!==2) throw new Error('Practice and held-out reports required.');
      const [missing]=await tx.sql<{n:number}>(`SELECT count(*)::int n FROM reports r WHERE r.challenge_id=$1 AND r.split IN ('public','private') AND NOT EXISTS(SELECT 1 FROM answer_keys k WHERE k.report_id=r.id AND k.mode_id=$2 AND k.schema_version=$3)`,[c.id,schema.id,schema.version]);
      if(missing.n) throw new Error('Complete reference answers required.');
      await tx.sql('UPDATE challenges SET is_active=false WHERE is_active AND id<>$1',[c.id]);
      // Revealed results must never become hidden again. All other selections begin paused.
      await tx.sql("UPDATE challenges SET is_active=true,archived_at=NULL,event_phase=CASE WHEN event_phase='ended' THEN 'ended' ELSE 'not_started' END,updated_at=now() WHERE id=$1",[c.id]);
    } else {
      if(c.is_active) throw new Error('Activate another contest before archiving the current contest.');
      await tx.sql("UPDATE challenges SET archived_at=now(),updated_at=now() WHERE id=$1",[c.id]);
    }
    return {ok:true,contestId:c.id};
  });
}
