import "server-only";
import {expireSandboxJobs} from "./sandbox";
import type { Database } from "./database";
import { validateContestSchema } from "../contest-schema";
import {
  buildOutputSchema,
  buildVersionedAnswerKeyStoragePayload,
  resolveChallengeMode,
  validateAnswerValues,
} from "../schema-storage";
import { defaultChallengeMode, type ChallengeModeDefinition } from "../challenge-modes";
type ContestRow = {
  id: string;
  mode_id: string;
  schema_version: number;
  contest_schema: unknown;
  schema_locked: boolean;
  configuration_frozen_at: string|null;
  schema_ready: boolean;
  archived_at: string|null;
  management_revision:number;
  evaluation_model:string|null;
  public_submission_limit:number;
  sandbox_enabled:boolean;
  is_active:boolean;event_phase:string;final_submission_limit:number;
};
export async function contestSchemaState(db: Database, contestId?: string, includeReports = false) {
  const [c] = await db.sql<ContestRow>(
    "SELECT id,mode_id,schema_version,contest_schema,schema_locked,configuration_frozen_at,schema_ready,archived_at,management_revision,evaluation_model,public_submission_limit,sandbox_enabled,is_active,event_phase,final_submission_limit FROM challenges WHERE $1::uuid IS NULL OR id=$1 ORDER BY is_active DESC, created_at DESC LIMIT 1",
    [contestId ?? null],
  );
  if (!c) {
    if (contestId) throw new Error("Contest not found.");
    return {contestId:"",schema:defaultChallengeMode as ChallengeModeDefinition,locked:false,ready:false,reports:[],history:[],revision:0,evaluationModel:null,practiceBudget:5,isActive:false,eventPhase:"not_started",archivedAt:null,finalBudget:1,frozen:false,configurationFrozenAt:null,sandboxEnabled:false,sandboxSamples:[]};
  }
  const reports = await db.sql<{ id: string; filename: string; split: string }>(
    "SELECT id,filename,split FROM reports WHERE challenge_id=$1 AND split IN ('public','private') ORDER BY filename",
    [c.id],
  );
  const history = await db.sql<{participant_code:string;submission_type:string;attempt_number:number;score:number;submitted_at:string}>(
    "SELECT p.participant_code,s.submission_type,s.attempt_number,s.score,s.submitted_at FROM submissions s JOIN participants p ON p.id=s.participant_id WHERE s.challenge_id=$1 ORDER BY s.submitted_at DESC LIMIT 200",[c.id]);
  return {
    reportDetails: includeReports ? await db.sql<{id:string;filename:string;split:string;report_text:string;answer_values:Record<string,unknown>|null;provenance:string|null}>("SELECT r.id,r.filename,r.split,r.report_text,k.answer_values,k.provenance FROM reports r LEFT JOIN answer_keys k ON k.report_id=r.id AND k.mode_id=$2 AND k.schema_version=$3 WHERE r.challenge_id=$1 ORDER BY r.filename",[c.id,c.mode_id,c.schema_version]) : undefined,
    history,
    isActive:c.is_active,eventPhase:c.event_phase,archivedAt:c.archived_at,finalBudget:c.final_submission_limit,
    sandboxEnabled:c.sandbox_enabled,
    sandboxSamples:await db.sql<{id:string;filename:string}>("SELECT id,filename FROM reports WHERE challenge_id=$1 AND split='sample' ORDER BY id",[c.id]),
    revision:c.management_revision,
    evaluationModel:c.evaluation_model,
    practiceBudget:c.public_submission_limit,
    contestId: c.id,
    schema: resolveChallengeMode(c.mode_id, c.schema_version, c.contest_schema),
    configurationFrozenAt: c.configuration_frozen_at,
    frozen: Boolean(c.configuration_frozen_at),
    locked: c.schema_locked || Boolean(c.configuration_frozen_at) || Boolean(c.archived_at),
    ready: c.schema_ready,
    reports,
  };
}
export async function saveContestSchema(db: Database, payload: unknown) {
  if (!payload || typeof payload !== "object")
    throw new Error("Invalid request.");
  const p = payload as {
    schema?: unknown;
    answers?: unknown;
    action?: string;
    expectedVersion?: number;
    expectedRevision?: number;
    contestId?: string;
    reports?: unknown;
    report?: {id?:string;filename?:string;report_text?:string;split?:string};
  };
  return db.transaction(async (tx) => {
    await tx.sql("SELECT pg_advisory_xact_lock(718204,1)");
    const [c] = await tx.sql<ContestRow>(
      "SELECT id,mode_id,schema_version,contest_schema,schema_locked,configuration_frozen_at,schema_ready,archived_at,management_revision,evaluation_model,public_submission_limit,sandbox_enabled,is_active,event_phase,final_submission_limit FROM challenges WHERE id=$1 FOR UPDATE",
      [p.contestId],
    );
    if (!c || c.id !== p.contestId || c.schema_version !== p.expectedVersion || (p.expectedRevision !== undefined && p.expectedRevision !== c.management_revision))
      throw new Error("Contest changed; reload before saving.");
    if (p.action === "fork") {
      const current = resolveChallengeMode(
        c.mode_id,
        c.schema_version,
        c.contest_schema,
      );
      const next = validateContestSchema({
        ...current,
        id: `contest_${crypto.randomUUID().replaceAll("-", "")}`,
        version: 1,
      });
      const [created] = await tx.sql<{ id: string }>(
        "INSERT INTO challenges(slug,title,description,instructions,output_schema,locked_model,evaluation_model,mode_id,schema_version,contest_schema,schema_ready,public_submission_limit,final_submission_limit,is_active,sandbox_enabled,event_phase) SELECT slug || '-' || substr(gen_random_uuid()::text,1,8),title,description,instructions,$2::jsonb,locked_model,evaluation_model,$3,1,$4::jsonb,false,public_submission_limit,final_submission_limit,false,sandbox_enabled,'not_started' FROM challenges WHERE id=$1 RETURNING id",
        [
          c.id,
          JSON.stringify(buildOutputSchema(next)),
          next.id,
          JSON.stringify(next),
        ],
      );
      await tx.sql(
        "INSERT INTO reports(challenge_id,external_id,filename,split,report_text,synthetic) SELECT $2,external_id,filename,split,report_text,synthetic FROM reports WHERE challenge_id=$1",
        [c.id, created.id],
      );

      // Only current-version references follow the draft; never historical runs or grants.
      const keys = await tx.sql<{report_id:string;answer_values:unknown;provenance:string;import_batch_id:string|null;adjudicated_by:string|null;adjudicated_at:string|null;notes:string|null}>(
        `SELECT dst.id report_id,k.answer_values,k.provenance,k.import_batch_id,k.adjudicated_by,k.adjudicated_at,k.notes FROM reports src
         JOIN reports dst ON dst.challenge_id=$2 AND dst.external_id=src.external_id
         JOIN answer_keys k ON k.report_id=src.id AND k.mode_id=$3 AND k.schema_version=$4
         WHERE src.challenge_id=$1`, [c.id,created.id,current.id,current.version]);
      for (const key of keys) {
        const values=validateAnswerValues(key.answer_values,next);
        const result=await tx.execute({table:"answer_keys",operation:"insert",values:{report_id:key.report_id,
          ...buildVersionedAnswerKeyStoragePayload(values,next),provenance:key.provenance,import_batch_id:key.import_batch_id,adjudicated_by:key.adjudicated_by,adjudicated_at:key.adjudicated_at,notes:key.notes}});
        if(result.error) throw new Error("Could not duplicate reference answers.");
      }
      const [coverage]=await tx.sql<{n:number;public_count:number;private_count:number}>(
        `SELECT count(*) FILTER(WHERE split IN ('public','private'))::int n,
         count(*) FILTER(WHERE split='public')::int public_count,count(*) FILTER(WHERE split='private')::int private_count
         FROM reports WHERE challenge_id=$1`,[created.id]);
      const [missing]=await tx.sql<{n:number}>(`SELECT count(*)::int n FROM reports r WHERE challenge_id=$1 AND split IN ('public','private')
        AND NOT EXISTS(SELECT 1 FROM answer_keys k WHERE k.report_id=r.id AND k.mode_id=$2 AND k.schema_version=1)`,[created.id,next.id]);
      await tx.sql("UPDATE challenges SET schema_ready=$2 WHERE id=$1",[created.id,Boolean(c.schema_ready && coverage.public_count && coverage.private_count && !missing.n)]);

      return { ok: true, contestId: created.id, schema: next };
    }
    await expireSandboxJobs(tx);
    if ((await tx.sql("SELECT id FROM sandbox_jobs WHERE challenge_id=$1 AND status='running' LIMIT 1",[c.id])).length) throw new Error("Wait for in-flight sandbox work before editing.");
    if (c.schema_locked || c.configuration_frozen_at || c.archived_at)
      throw new Error(
        "Contest is locked. Create a new contest version before editing.",
      );
    const current = resolveChallengeMode(
      c.mode_id,
      c.schema_version,
      c.contest_schema,
    );
    let schema: ChallengeModeDefinition = current;
    if (p.action === "report") {
      const r=p.report;
      if (!r || typeof r.id!=="string" || typeof r.filename!=="string" || !r.filename.trim() || r.filename.length>500 || typeof r.report_text!=="string" || !r.report_text.trim() || r.report_text.length>100000 || !["public","private","sample"].includes(r.split||"")) throw new Error("Invalid report edit.");
      const found=await tx.sql("SELECT id FROM reports WHERE id=$1 AND challenge_id=$2",[r.id,c.id]);
      if(!found.length)throw new Error("Report does not belong to this draft.");
      if((await tx.sql("SELECT id FROM reports WHERE challenge_id=$1 AND filename=$2 AND id<>$3",[c.id,r.filename.trim(),r.id])).length)throw new Error("Duplicate report filename.");
      await tx.sql("UPDATE reports SET filename=$3,report_text=$4,split=$5 WHERE id=$1 AND challenge_id=$2",[r.id,c.id,r.filename.trim(),r.report_text,r.split]);
      await tx.sql("UPDATE challenges SET schema_ready=false,event_phase='not_started',updated_at=clock_timestamp() WHERE id=$1",[c.id]);
    } else if (p.action === "reports") {
      if (!Array.isArray(p.reports) || p.reports.length < 2 || p.reports.length > 1000)
        throw new Error("Import 2–1000 reports, including practice and held-out cases.");
      const rows = p.reports as {external_id: string; filename: string; split: string; report_text: string}[];
      const ids = new Set<string>();
      const names = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row.external_id !== "string" || !row.external_id.trim() || typeof row.filename !== "string" || !row.filename.trim() || typeof row.report_text !== "string" || !row.report_text.trim() || row.report_text.length > 100000 || !["public","private"].includes(row.split) || ids.has(row.external_id) || names.has(row.filename))
          throw new Error("Invalid or duplicate report. No import saved.");
        ids.add(row.external_id); names.add(row.filename);
      }
      if (!rows.some(r => r.split === 'public') || !rows.some(r => r.split === 'private'))
        throw new Error("Both practice and held-out reports required.");
      const existing = await tx.sql("SELECT id FROM reports WHERE challenge_id=$1 LIMIT 1", [c.id]);
      if (existing.length) throw new Error("Bulk report import requires an empty draft; duplicate a configuration or create an empty contest.");
      for (const row of rows) await tx.sql("INSERT INTO reports(challenge_id,external_id,filename,split,report_text,synthetic) VALUES($1,$2,$3,$4,$5,false)", [c.id,row.external_id,row.filename,row.split,row.report_text]);
      await tx.sql("UPDATE challenges SET schema_ready=false,event_phase='not_started',updated_at=now() WHERE id=$1", [c.id]);
    } else if (p.action === "schema") {
      const proposed = validateContestSchema(p.schema);
      // Custom identity is server-generated, never overwrites the legacy template's v1.
      schema = validateContestSchema({
        ...proposed,
        id: `contest_${c.id.replaceAll("-", "")}`,
        version: c.schema_version + 1,
      });
      await tx.sql(
        "UPDATE challenges SET contest_schema=$2::jsonb,mode_id=$3,schema_version=$4,output_schema=$5::jsonb,schema_ready=false,event_phase='not_started',title=$6,description=$7,updated_at=now() WHERE id=$1",
        [
          c.id,
          JSON.stringify(schema),
          schema.id,
          schema.version,
          JSON.stringify(buildOutputSchema(schema)),
          schema.title,
          schema.description ?? null,
        ],
      );
    } else if (p.action === "answers") {
      if (!Array.isArray(p.answers))
        throw new Error("Answers must be an array.");
      const reports = await tx.sql<{
        id: string;
        filename: string;
        external_id: string;
        split: string;
      }>(
        "SELECT id,filename,external_id,split FROM reports WHERE challenge_id=$1 AND split IN ('public','private')",
        [c.id],
      );
      if (
        !reports.some((r) => r.split === "public") ||
        !reports.some((r) => r.split === "private")
      )
        throw new Error("Readiness requires practice and held-out reports.");
      const adjudicated = await tx.sql<{ n: number }>(
        "SELECT count(*)::int n FROM answer_keys k JOIN reports r ON r.id=k.report_id WHERE r.challenge_id=$1 AND k.mode_id=$2 AND k.schema_version=$3 AND k.provenance='clinician_adjudicated'",
        [c.id, schema.id, schema.version],
      );
      if (adjudicated[0].n)
        throw new Error(
          "This version has clinician-adjudicated answers. Save a new draft version before replacing them.",
        );
      const seen = new Set<string>();
      for (const item of p.answers as {
        report_id_or_filename?: string;
        answer_values?: unknown;
      }[]) {
        const matches = reports.filter((r) =>
          [r.id, r.filename, r.external_id].includes(
            item?.report_id_or_filename || "",
          ),
        );
        if (matches.length !== 1 || seen.has(matches[0].id))
          throw new Error("Unknown, ambiguous or duplicate report identifier.");
        const r = matches[0];
        seen.add(r.id);
        const values = validateAnswerValues(item.answer_values, schema);
        const write = await tx.execute({
          table: "answer_keys",
          operation: "upsert",
          conflict: "report_id,mode_id,schema_version",
          values: {
            report_id: r.id,
            ...buildVersionedAnswerKeyStoragePayload(values, schema),
            provenance: "imported",
          },
        });
        if (write.error) throw new Error("Could not import answer keys.");
      }
      if (seen.size !== reports.length)
        throw new Error(
          "Every practice and held-out report requires an answer key. No partial import was saved.",
        );
      // Legacy NULL-schema keys do not toggle readiness. Always change updated_at
      // so the management-revision trigger fences stale editors, even on reimport.
      await tx.sql("UPDATE challenges SET schema_ready=true,updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 microsecond') WHERE id=$1", [
        c.id,
      ]);
    } else throw new Error("Unsupported action.");
    return { ok: true, schema };
  });
}
