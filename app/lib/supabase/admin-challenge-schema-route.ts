import "server-only";

import {
  createChallengeSchemaMetadata,
  createChallengeSchemaPreflight,
  createEmptyProvenanceCounts,
  EXISTING_ANSWER_KEY_ERROR,
  executeAnswerKeyImportWrite,
  getActivatableChallengeMode,
  getChallengeModeForValidation,
  type AdminSchemaAnswerKeyRow,
  type AdminSchemaReportRow,
  prepareAnswerKeyImportPayload,
  parseAnswerKeyImportMetadata,
  validateTargetAnswerKeyCoverage,
  validateTargetAnswerKeysForActivation,
} from "./admin-challenge-schema";
import type { ChallengeModeDefinition } from "@/app/lib/challenge-modes";
import { isChallengeModeActivationAllowed } from "@/app/lib/challenge-modes";
import { getChallengeConfigurationLockStatus } from "./admin-challenge";

const TWELVE_FIELD_MODE = "knee_mri_12_basic";

import type { Database } from '../db/database';

async function loadActiveChallengeReports(
  supabase: unknown,
  targetMode?: ChallengeModeDefinition,
) {
  const client = supabase as Database;
  const challengeResult = await client.execute<{id:string; mode_id:string|null; schema_version:number|null}>({table:'challenges',columns:'id, mode_id, schema_version',where:[['is_active','eq',true]],single:'single'});
  if (challengeResult.error || !challengeResult.data) {
    throw new Error("No active challenge was found.");
  }

  const reportsResult = await client.execute<AdminSchemaReportRow[]>({table:'reports',columns:'id, split, filename, external_id',where:[['challenge_id','eq',challengeResult.data.id],['split','in',['public','private']]]});
  if (reportsResult.error) {
    throw new Error("Could not validate challenge reports and answer keys.");
  }

  const mode = targetMode || getChallengeModeForValidation(
    challengeResult.data.mode_id,
    challengeResult.data.schema_version,
  );
  return {
    challengeId: challengeResult.data.id,
    mode,
    reports: reportsResult.data,
  };
}

export async function prepareAdminAnswerKeyImport(
  supabase: unknown,
  payload: unknown,
) {
  const body = payload as {
    modeId?: unknown;
    mode_id?: unknown;
    schemaVersion?: unknown;
    schema_version?: unknown;
    write?: unknown;
    overwrite?: unknown;
  } | null;
  const mode = getChallengeModeForValidation(
    body?.modeId ?? body?.mode_id,
    body?.schemaVersion ?? body?.schema_version,
  );
  if (mode.id !== TWELVE_FIELD_MODE) {
    throw new Error("This preparation path is only available for knee_mri_12_basic.");
  }
  if (body?.write !== undefined && typeof body.write !== "boolean") {
    throw new Error("The write option must be true or false.");
  }
  if (body?.overwrite !== undefined && typeof body.overwrite !== "boolean") {
    throw new Error("The overwrite option must be true or false.");
  }

  const write = body?.write === true;
  const overwrite = body?.overwrite === true;
  const importMetadata = parseAnswerKeyImportMetadata(
    payload,
    `knee-mri-12-${crypto.randomUUID()}`,
    new Date().toISOString(),
  );
  const inputs = await loadActiveChallengeReports(supabase, mode);
  const preparation = prepareAnswerKeyImportPayload(
    payload,
    inputs.reports,
    mode,
    importMetadata,
  );
  const provenanceCounts = createEmptyProvenanceCounts();
  provenanceCounts[importMetadata.provenance] = preparation.validation.validItemCount;
  const baseResult = {
    ok: preparation.validation.ok,
    modeId: mode.id,
    schemaVersion: mode.version,
    write,
    totalItems: preparation.validation.itemCount,
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: write && !preparation.validation.ok
      ? preparation.validation.itemCount
      : 0,
    provenanceCounts,
    issues: preparation.validation.issues,
  };

  if (!write || !preparation.validation.ok) return baseResult;

  const client = supabase as Database;
  const existingResult = await client.execute<{report_id:string;provenance:string|null}[]>({table:'answer_keys',columns:'report_id, provenance',where:[['report_id','in',preparation.rows.map(row=>row.report_id)],['mode_id','eq',mode.id],['schema_version','eq',mode.version]]});
  if (existingResult.error) {
    console.error("[admin-answer-key-import] Existing-row check failed", {
      code: existingResult.error.code,
    });
    throw new Error("Could not write twelve-field answer keys.");
  }

  const existingReportIds = new Set(
    (existingResult.data || []).map((row) => row.report_id),
  );
  if (
    overwrite &&
    importMetadata.provenance !== "clinician_adjudicated" &&
    (existingResult.data || []).some(
      (row) => row.provenance === "clinician_adjudicated",
    )
  ) {
    throw new Error(
      "Clinician-adjudicated answer keys cannot be replaced by non-adjudicated imports.",
    );
  }
  const writeRows = async (
    operation: "insert" | "upsert",
    rows: readonly (typeof preparation.rows)[number][],
  ) => {
    const writeResult = await client.execute({table:'answer_keys',operation,values:[...rows],conflict:'report_id,mode_id,schema_version'});
    if (writeResult.error) {
      if (writeResult.error.code === "23505") {
        throw new Error(EXISTING_ANSWER_KEY_ERROR);
      }
      console.error("[admin-answer-key-import] Write failed", {
        code: writeResult.error.code,
      });
      throw new Error("Could not write twelve-field answer keys.");
    }
  };
  const plan = await executeAnswerKeyImportWrite(
    preparation.rows,
    existingReportIds,
    overwrite,
    {
      insert: (rows) => writeRows("insert", rows),
      upsert: (rows) => writeRows("upsert", rows),
    },
  );
  if (plan.blocked) {
    return {
      ...baseResult,
      ok: false,
      skippedCount: plan.skippedCount,
      issues: [{
        type: "existing_answer_key" as const,
        count: existingReportIds.size,
        message: EXISTING_ANSWER_KEY_ERROR,
      }],
    };
  }

  return {
    ...baseResult,
    ok: true,
    insertedCount: plan.insertedCount,
    updatedCount: plan.updatedCount,
    skippedCount: plan.skippedCount,
  };
}

export async function validateAdminChallengeSchema(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const mode = getChallengeModeForValidation(modeId, schemaVersion);
  const inputs = await loadChallengeSchemaInputsForMode(supabase, mode);
  return validateTargetAnswerKeyCoverage(inputs.reports, inputs.answerKeys, mode);
}

export async function preflightAdminChallengeSchema(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const mode = getChallengeModeForValidation(modeId, schemaVersion);
  const inputs = await loadChallengeSchemaInputsForMode(supabase, mode);
  const locked = await getChallengeConfigurationLockStatus(
    supabase,
    inputs.challengeId,
  );

  return createChallengeSchemaPreflight(
    inputs.reports,
    inputs.answerKeys,
    mode,
    {
      allowlisted: isChallengeModeActivationAllowed(mode.id),
      locked,
    },
  );
}

export async function callAdminChallengeSchemaUpdate(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const mode = getActivatableChallengeMode(modeId, schemaVersion);
  const metadata = createChallengeSchemaMetadata(mode);
  const inputs = await loadChallengeSchemaInputsForMode(supabase, mode);
  validateTargetAnswerKeysForActivation(inputs.reports, inputs.answerKeys, mode);
  const client = supabase as Database;
  const rpcResult = await client.rpc("admin_update_challenge_schema", {
    target_mode_id: metadata.modeId,
    target_schema_version: metadata.schemaVersion,
    target_output_schema: metadata.outputSchema,
  });
  if (rpcResult.error) throw new Error(rpcResult.error.message);
  return { ok: true, modeId: metadata.modeId, schemaVersion: metadata.schemaVersion, fieldCount: mode.fields.length };
}

async function loadChallengeSchemaInputsForMode(
  supabase: unknown,
  mode: ChallengeModeDefinition,
) {
  const reports = await loadActiveChallengeReports(supabase, mode);
  const client = supabase as Database;
  const keysResult = await client.execute<AdminSchemaAnswerKeyRow[]>({table:'answer_keys',columns:'report_id, provenance, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion',where:[['report_id','in',reports.reports.map(report=>report.id)],['mode_id','eq',mode.id],['schema_version','eq',mode.version]]});
  if (keysResult.error) {
    throw new Error("Could not validate challenge reports and answer keys.");
  }

  return {
    challengeId: reports.challengeId,
    reports: reports.reports,
    answerKeys: keysResult.data,
  };
}
