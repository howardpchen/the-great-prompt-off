import "server-only";
import {createHash} from "node:crypto";
import type {Database} from "./database";
import {resolveChallengeMode} from "../schema-storage";
export const SANDBOX_REPORT_COUNT=3;
export const SANDBOX_COOLDOWN_SECONDS=60;
export class SandboxError extends Error { constructor(message:string,readonly status=409,readonly retryAfter=0){super(message);} }
export type SandboxReport={id:string;text:string};
export type SandboxJob={id:string;challenge_id:string;participant_id:string;schema_version:number;prompt:string;reports:SandboxReport[];results:unknown[];status:string;simulation:boolean;completed_at:string|null};
export type SandboxInput={contestId:string;schemaVersion:number;idempotencyKey:string;prompt:string;reports:SandboxReport[]};
type Contest={id:string;mode_id:string;schema_version:number;contest_schema:unknown;evaluation_model:string;is_active:boolean;sandbox_enabled:boolean;event_phase:string};
export async function expireSandboxJobs(db:Database) {
 // Crash recovery starts a fresh cooldown when an expired worker is observed; never replays paid calls.
 await db.sql("UPDATE sandbox_jobs SET status='failed',completed_at=now() WHERE status='running' AND expires_at<=now()");
}
export async function sandboxStatus(db:Database, participantId:string,contestId:string) {
 await expireSandboxJobs(db);
 const [contest]=await db.sql<Contest>('SELECT * FROM challenges WHERE id=$1 AND is_active',[contestId]);
 if(!contest)throw new SandboxError('Contest changed; reload.');
 const available=contest.sandbox_enabled && contest.event_phase==='practice_open';
 const reports=available ? await db.sql<{id:string;report_text:string}>("SELECT id,report_text FROM reports WHERE challenge_id=$1 AND split='sample' ORDER BY id",[contestId]):[];
 const [job]=await db.sql<SandboxJob>('SELECT * FROM sandbox_jobs WHERE participant_id=$1 AND challenge_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[participantId,contestId]);
 const [clock]=await db.sql<{cooldown_until:string|null;in_flight:boolean}>(`SELECT max(completed_at)+interval '60 seconds' cooldown_until,bool_or(status='running') in_flight FROM sandbox_jobs WHERE participant_id=$1`,[participantId]);
 return {enabled:available && reports.length===3,reports:reports.map(r=>({id:r.id,text:r.report_text})),job:job||null,cooldownUntil:clock.cooldown_until,inFlight:!!clock.in_flight,serverTime:new Date().toISOString()};
}
export async function admitSandbox(db:Database,participantId:string,input:SandboxInput,simulation:boolean) {
 if(!input || typeof input.prompt!=='string' || !input.prompt.trim() || input.prompt.length>12000 || typeof input.idempotencyKey!=='string' || !/^[a-zA-Z0-9-]{1,128}$/.test(input.idempotencyKey) || !Array.isArray(input.reports) || input.reports.length!==3 || input.reports.some(r=>!r || typeof r.id!=='string' || typeof r.text!=='string' || !r.text.trim() || r.text.length>30000) || new Set(input.reports.map(r=>r.id)).size!==3) throw new SandboxError('A prompt and three nonempty sample reports are required.',400);
 const canonical={contestId:input.contestId,schemaVersion:input.schemaVersion,prompt:input.prompt,reports:[...input.reports].sort((a,b)=>a.id.localeCompare(b.id))};
 const hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
 return db.transaction(async tx=>{
  await tx.sql('SELECT pg_advisory_xact_lock(718204,1)');
  await expireSandboxJobs(tx);
  const [c]=await tx.sql<Contest>('SELECT * FROM challenges WHERE id=$1 AND is_active',[input.contestId]);
  if(!c || c.schema_version!==input.schemaVersion)throw new SandboxError('Contest changed; reload.');
  const [prior]=await tx.sql<SandboxJob & {input_hash:string}>('SELECT * FROM sandbox_jobs WHERE participant_id=$1 AND idempotency_key=$2',[participantId,input.idempotencyKey]);
  if(prior){if(prior.input_hash!==hash)throw new SandboxError('Request key already used for different input.');return {job:prior,reused:true,contest:c};}
  if(!c.sandbox_enabled || c.event_phase!=='practice_open')throw new SandboxError('Sandbox is paused.');
  const mode=resolveChallengeMode(c.mode_id,c.schema_version,c.contest_schema);
  if(!mode.education)throw new SandboxError('Sandbox requires a structured educational contest.');
  const samples=await tx.sql<{id:string}>("SELECT id FROM reports WHERE challenge_id=$1 AND split='sample'",[c.id]);
  if(samples.length!==3 || input.reports.some(r=>!samples.some(s=>s.id===r.id)))throw new SandboxError('Only this contest’s three sandbox samples may be used.',400);
  const pending=await tx.sql("SELECT id FROM sandbox_jobs WHERE participant_id=$1 AND status='running'",[participantId]);
  if(pending.length)throw new SandboxError('Your sandbox run is already in progress.');
  const [cooldown]=await tx.sql<{seconds:number}>("SELECT ceil(extract(epoch FROM max(completed_at)+interval '60 seconds'-now()))::int seconds FROM sandbox_jobs WHERE participant_id=$1",[participantId]);
  if(cooldown.seconds>0)throw new SandboxError('Wait 60 seconds after your previous sandbox run finishes.',429,cooldown.seconds);
  const [job]=await tx.sql<SandboxJob>(`INSERT INTO sandbox_jobs(challenge_id,participant_id,schema_version,idempotency_key,input_hash,prompt,reports,simulation) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,[c.id,participantId,c.schema_version,input.idempotencyKey,hash,input.prompt,JSON.stringify(canonical.reports),simulation]);
  return {job,reused:false,contest:c};
 });
}
export async function appendSandboxResult(db:Database,id:string,result:unknown) {
 await db.sql("UPDATE sandbox_jobs SET results=results || $2::jsonb WHERE id=$1 AND status='running' AND expires_at>now()",[id,JSON.stringify([result])]);
}
export async function finishSandbox(db:Database,id:string,status:'completed'|'failed'|'cancelled') {
 await db.sql("UPDATE sandbox_jobs SET status=$2,completed_at=now() WHERE id=$1 AND status='running'",[id,status]);
}
