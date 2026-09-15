import "server-only";
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
  schema_ready: boolean;
};
export async function contestSchemaState(db: Database, contestId?: string) {
  const [c] = await db.sql<ContestRow>(
    "SELECT id,mode_id,schema_version,contest_schema,schema_locked,schema_ready FROM challenges WHERE $1::uuid IS NULL OR id=$1 ORDER BY is_active DESC, created_at DESC LIMIT 1",
    [contestId ?? null],
  );
  if (!c) {
    if (contestId) throw new Error("Contest not found.");
    return {contestId:"",schema:defaultChallengeMode as ChallengeModeDefinition,locked:false,ready:false,reports:[],history:[]};
  }
  const reports = await db.sql<{ id: string; filename: string; split: string }>(
    "SELECT id,filename,split FROM reports WHERE challenge_id=$1 AND split IN ('public','private') ORDER BY filename",
    [c.id],
  );
  const history = await db.sql<{participant_code:string;submission_type:string;attempt_number:number;score:number;submitted_at:string}>(
    "SELECT p.participant_code,s.submission_type,s.attempt_number,s.score,s.submitted_at FROM submissions s JOIN participants p ON p.id=s.participant_id WHERE s.challenge_id=$1 ORDER BY s.submitted_at DESC LIMIT 200",[c.id]);
  return {
    history,
    contestId: c.id,
    schema: resolveChallengeMode(c.mode_id, c.schema_version, c.contest_schema),
    locked: c.schema_locked,
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
    contestId?: string;
    reports?: unknown;
  };
  return db.transaction(async (tx) => {
    await tx.sql("SELECT pg_advisory_xact_lock(718204,1)");
    const [c] = await tx.sql<ContestRow>(
      "SELECT id,mode_id,schema_version,contest_schema,schema_locked,schema_ready FROM challenges WHERE id=$1 FOR UPDATE",
      [p.contestId],
    );
    if (!c || c.id !== p.contestId || c.schema_version !== p.expectedVersion)
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
        "INSERT INTO challenges(slug,title,description,instructions,output_schema,locked_model,evaluation_model,mode_id,schema_version,contest_schema,schema_ready,public_submission_limit,final_submission_limit,is_active) SELECT slug || '-' || substr(gen_random_uuid()::text,1,8),title,description,instructions,$2::jsonb,locked_model,evaluation_model,$3,1,$4::jsonb,false,public_submission_limit,final_submission_limit,false FROM challenges WHERE id=$1 RETURNING id",
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

      return { ok: true, contestId: created.id, schema: next };
    }
    if (c.schema_locked)
      throw new Error(
        "Contest is locked. Create a new contest version before editing.",
      );
    const current = resolveChallengeMode(
      c.mode_id,
      c.schema_version,
      c.contest_schema,
    );
    let schema: ChallengeModeDefinition = current;
    if (p.action === "reports") {
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
      await tx.sql("UPDATE challenges SET schema_ready=true WHERE id=$1", [
        c.id,
      ]);
    } else throw new Error("Unsupported action.");
    return { ok: true, schema };
  });
}
