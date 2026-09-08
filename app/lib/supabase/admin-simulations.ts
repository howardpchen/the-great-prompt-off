import "server-only";

import {
  challengeModes,
  isChallengeModeActivationAllowed,
} from "@/app/lib/challenge-modes";
import { getSimulationProfile } from "@/app/lib/simulation-profiles";
import { simulationProfiles } from "@/app/lib/simulation-profiles";
import type { SimulationAnalyticsRun } from "@/app/lib/simulation-analytics";
import {
  buildSimulationReproducibilitySummary,
  type SimulationBatchWithSchema,
} from "@/app/lib/simulation-reproducibility";
import {
  executeDeterministicSimulation,
  runDeterministicSimulation,
  type SimulationReportScope,
} from "@/app/lib/simulation-runner";
import {
  createSchemaSnapshot,
  resolveChallengeMode,
} from "@/app/lib/schema-storage";
import { createDatabase } from "./admin";
import {
  getActiveChallenge,
  getSupabaseAnswerKeysForSplit,
} from "./submission-workflow";

export class SimulationInputError extends Error {}
export class SimulationDataUnavailableError extends Error {}
export class SimulationPersistenceError extends Error {}
export class SimulationNotFoundError extends Error {}

type StoredSimulationBatch = SimulationBatchWithSchema & {
  is_reference: boolean;
  reference_label: string | null;
  reference_notes: string | null;
};

export async function runAdminSimulationDryRun(
  supabase: ReturnType<typeof createDatabase>,
  payload: unknown,
) {
  const context = await loadSimulationContext(supabase, payload);

  return runDeterministicSimulation({
    mode: context.mode,
    reportScope: context.input.reportScope,
    reports: context.reports,
    profileIds: context.input.profileIds,
  });
}

export async function runAndPersistAdminSimulation(
  supabase: ReturnType<typeof createDatabase>,
  payload: unknown,
) {
  const context = await loadSimulationContext(supabase, payload);
  const execution = executeDeterministicSimulation({
    mode: context.mode,
    reportScope: context.input.reportScope,
    reports: context.reports,
    profileIds: context.input.profileIds,
  });
  let batchId: string | null = null;

  try {
    const { data: batch, error: batchError } = await supabase.execute<{ id: string }>({ table: "simulation_batches", values: {
        challenge_id: context.challengeId,
        mode_id: context.mode.id,
        schema_version: context.mode.version,
        schema_snapshot: createSchemaSnapshot(context.mode),
        evaluator_type: "deterministic_mock",
        model: null,
        report_scope: context.input.reportScope,
        status: "running",
        report_count: execution.summary.reportCount,
        field_count: execution.summary.fieldCount,
        profile_count: execution.runs.length,
        total_evaluations: execution.summary.totalEvaluations,
      }, columns: "id", single: "single", operation: "insert" });

    if (batchError || !batch) {
      throw new Error(batchError?.message || "Simulation batch insert failed.");
    }
    batchId = batch.id;

    const { data: storedRuns, error: runsError } = await supabase.execute<Array<{ id: string; profile_id: string; profile_version: number }>>({ table: "simulation_runs", values: execution.runs.map((run) => ({
          simulation_batch_id: batch.id,
          profile_id: run.profileId,
          profile_version: run.profileVersion,
          profile_label: run.profileLabel,
          strategy_snapshot: run.strategySnapshot,
          correct_fields: run.correctFields,
          total_fields: run.totalFields,
          score: run.score,
          valid_json_count: run.validJsonCount,
          invalid_json_count: run.invalidJsonCount,
          missing_field_count: run.missingFieldCount,
          invalid_value_count: run.invalidValueCount,
          completed_report_count: run.completedReportCount,
        })), columns: "id, profile_id, profile_version", operation: "insert" });

    if (runsError || !storedRuns || storedRuns.length !== execution.runs.length) {
      throw new Error(runsError?.message || "Simulation run insert failed.");
    }

    const runIdByProfile = new Map(
      storedRuns.map((run) => [profileKey(run.profile_id, run.profile_version), run.id]),
    );
    const itemRows = execution.runs.flatMap((run) => {
      const simulationRunId = runIdByProfile.get(
        profileKey(run.profileId, run.profileVersion),
      );
      if (!simulationRunId) {
        throw new Error("Stored simulation run mapping is incomplete.");
      }

      return run.items.map((item) => ({
        simulation_run_id: simulationRunId,
        report_id: item.reportId,
        correct_fields: item.correctFields,
        total_fields: item.totalFields,
        score: item.score,
        valid_json: item.validJson,
        missing_fields: item.missingFields,
        invalid_fields: item.invalidFields,
        scored_values: item.scoredValues,
      }));
    });

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase.execute<Record<string, unknown>[]>({ table: "simulation_run_items", values: itemRows, operation: "insert" });
      if (itemsError) {
        throw new Error(itemsError.message);
      }
    }

    const { error: completionError } = await supabase.execute<Record<string, unknown>[]>({ table: "simulation_batches", values: {
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
      }, operation: "update", where: [["id", "eq", batch.id]] });
    if (completionError) {
      throw new Error(completionError.message);
    }

    return {
      ...execution.summary,
      persisted: true as const,
      batchId: batch.id,
      messages: [
        "Deterministic simulation saved to isolated simulation storage.",
        "No participants, attempts, real prompt runs, submissions, or leaderboard rows were created.",
      ],
    };
  } catch (error) {
    if (batchId) {
      const { error: cleanupError } = await supabase.rpc(
        "admin_delete_simulation_batch",
        { target_batch_id: batchId },
      );
      if (cleanupError) {
        console.error("[admin-simulation] Partial batch cleanup failed", {
          batchId,
          message: cleanupError.message,
        });
        const { error: failedStatusError } = await supabase.execute<Record<string, unknown>[]>({ table: "simulation_batches", values: {
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "Simulation persistence failed; cleanup is required.",
          }, operation: "update", where: [["id", "eq", batchId]] });
        if (failedStatusError) {
          console.error("[admin-simulation] Failed status update failed", {
            batchId,
            message: failedStatusError.message,
          });
        }
      }
    }

    console.error("[admin-simulation] Persistent simulation failed", {
      batchId,
      message: error instanceof Error ? error.message : "Unknown storage error",
    });
    throw new SimulationPersistenceError(
      "The simulation was not saved. No real event data was changed.",
    );
  }
}

export async function listAdminSimulationBatches(
  supabase: ReturnType<typeof createDatabase>,
) {
  const challenge = await getActiveChallenge(supabase);
  const [{ data, error }, { data: reportRows, error: reportError }] =
    await Promise.all([
      supabase.execute<Record<string, unknown>[]>({ table: "simulation_batches", columns: "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at, is_reference, reference_label", limit: 25, operation: "select", where: [["challenge_id", "eq", challenge.id]], order: [["created_at", { ascending: false }]] }),
      supabase.execute<Record<string, unknown>[]>({ table: "reports", columns: "split", operation: "select", where: [["challenge_id", "eq", challenge.id],["split", "in", ["public", "private"]]] }),
    ]);

  if (error || reportError) {
    throw new SimulationDataUnavailableError(
      "Simulation history is temporarily unavailable.",
    );
  }

  const activeMode = resolveChallengeMode(
    challenge.mode_id,
    challenge.schema_version,
    challenge.contest_schema,
  );
  const reportCounts = (reportRows ?? []).reduce<{public:number;private:number}>(
    (counts, report) => {
      if (report.split === "public") {
        counts.public += 1;
      } else if (report.split === "private") {
        counts.private += 1;
      }
      return counts;
    },
    { public: 0, private: 0 },
  );

  return {
    ok: true,
    batches: data ?? [],
    configuration: {
      activeModeId: activeMode.id,
      modes: [activeMode, ...Object.values(challengeModes).filter(m => m.id !== activeMode.id)].map((mode) => ({
        id: mode.id,
        version: mode.version,
        title: mode.title,
        fieldCount: mode.fields.length,
        active:
          mode.id === activeMode.id && mode.version === activeMode.version,
        rehearsalOnly: !isChallengeModeActivationAllowed(mode.id),
      })),
      profiles: simulationProfiles.map((profile) => ({
        id: profile.id,
        version: profile.version,
        label: profile.label,
        description: profile.description,
        purpose: profile.purpose,
      })),
      reportCounts: {
        ...reportCounts,
        all: reportCounts.public + reportCounts.private,
      },
    },
  };
}

export async function getAdminSimulationBatch(
  supabase: ReturnType<typeof createDatabase>,
  batchId: string,
) {
  const batch = await getActiveChallengeBatch(supabase, batchId);
  const { data: runs, error } = await supabase.execute<SimulationAnalyticsRun[]>({ table: "simulation_runs", columns: "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at", operation: "select", where: [["simulation_batch_id", "eq", batch.id]], order: [["created_at", { ascending: true }]] });

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation summary is temporarily unavailable.",
    );
  }

  const safeBatch = {
    id: batch.id,
    mode_id: batch.mode_id,
    schema_version: batch.schema_version,
    evaluator_type: batch.evaluator_type,
    report_scope: batch.report_scope,
    status: batch.status,
    report_count: batch.report_count,
    field_count: batch.field_count,
    profile_count: batch.profile_count,
    total_evaluations: batch.total_evaluations,
    created_at: batch.created_at,
    completed_at: batch.completed_at,
    is_reference: batch.is_reference,
    reference_label: batch.reference_label,
    reference_notes: batch.reference_notes,
  };
  return {
    ok: true,
    batch: safeBatch,
    profiles: runs ?? [],
    reproducibility: buildSimulationReproducibilitySummary(batch, runs ?? []),
  };
}

export async function deleteAdminSimulationBatch(
  supabase: ReturnType<typeof createDatabase>,
  batchId: string,
) {
  const batch = await getActiveChallengeBatch(supabase, batchId);
  const { error } = await supabase.rpc("admin_delete_simulation_batch", {
    target_batch_id: batch.id,
  });

  if (error) {
    throw new SimulationPersistenceError("The simulation batch could not be deleted.");
  }

  return { ok: true, deletedBatchId: batch.id };
}

export async function clearAdminSimulationData(
  supabase: ReturnType<typeof createDatabase>,
) {
  const challenge = await getActiveChallenge(supabase);
  const { error } = await supabase.rpc("admin_clear_simulation_data", {
    target_challenge_id: challenge.id,
  });

  if (error) {
    throw new SimulationPersistenceError("Simulation data could not be cleared.");
  }

  return { ok: true };
}

async function loadSimulationContext(
  supabase: ReturnType<typeof createDatabase>,
  payload: unknown,
) {
  const input = parseSimulationInput(payload);
  const challenge = await getActiveChallenge(supabase);
  let mode;

  try {
    mode = resolveChallengeMode(input.modeId, input.schemaVersion, input.modeId === challenge.mode_id ? challenge.contest_schema : undefined);
  } catch {
    throw new SimulationInputError(
      "The requested challenge mode or schema version is unsupported.",
    );
  }
  const splits = input.reportScope === "all"
    ? (["public", "private"] as const)
    : ([input.reportScope] as const);

  try {
    const reportSets = await Promise.all(
      splits.map((split) =>
        getSupabaseAnswerKeysForSplit(supabase, challenge.id, split, mode),
      ),
    );
    const reports = reportSets.flat().map((report) => {
      if (!report.supabaseReportId) {
        throw new Error("A simulation report is missing its database ID.");
      }

      return {
        id: report.supabaseReportId,
        split: report.split as "public" | "private",
        answerKey: report.answer_key,
      };
    });

    return { challengeId: challenge.id, input, mode, reports };
  } catch (error) {
    console.error("[admin-simulation] Simulation data loading failed", {
      modeId: mode.id,
      schemaVersion: mode.version,
      reportScope: input.reportScope,
      message: error instanceof Error ? error.message : "Unknown data error",
    });
    throw new SimulationDataUnavailableError(
      "Matching reports and answer keys are not available for this simulation.",
    );
  }
}

async function getActiveChallengeBatch(
  supabase: ReturnType<typeof createDatabase>,
  batchId: string,
) {
  if (!isUuid(batchId)) {
    throw new SimulationInputError("A valid simulation batch ID is required.");
  }

  const challenge = await getActiveChallenge(supabase);
  const { data, error } = await supabase.execute<StoredSimulationBatch>({ table: "simulation_batches", columns: "id, mode_id, schema_version, schema_snapshot, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at, is_reference, reference_label, reference_notes", single: "maybeSingle", operation: "select", where: [["id", "eq", batchId],["challenge_id", "eq", challenge.id]] });

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation summary is temporarily unavailable.",
    );
  }
  if (!data) {
    throw new SimulationNotFoundError("Simulation batch not found.");
  }

  return data;
}

function profileKey(profileId: string, profileVersion: number) {
  return `${profileId}:${profileVersion}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseSimulationInput(payload: unknown) {
  if (!isPlainObject(payload)) {
    throw new SimulationInputError("A simulation request body is required.");
  }

  const modeId = payload.modeId;
  const schemaVersion = payload.schemaVersion;
  const reportScope = payload.reportScope ?? "public";
  const profileIds = payload.profileIds;

  if (typeof modeId !== "string" || !modeId.trim()) {
    throw new SimulationInputError("A valid challenge mode is required.");
  }

  if (!Number.isInteger(schemaVersion) || Number(schemaVersion) <= 0) {
    throw new SimulationInputError("A valid schema version is required.");
  }

  if (!isSimulationReportScope(reportScope)) {
    throw new SimulationInputError("Report scope must be public, private, or all.");
  }

  if (
    profileIds !== undefined &&
    (!Array.isArray(profileIds) ||
      profileIds.length === 0 ||
      profileIds.some((profileId) => typeof profileId !== "string"))
  ) {
    throw new SimulationInputError("Select at least one valid simulation profile.");
  }

  const uniqueProfileIds = profileIds
    ? [...new Set(profileIds as string[])]
    : undefined;
  if (
    uniqueProfileIds?.some((profileId) => !getSimulationProfile(profileId))
  ) {
    throw new SimulationInputError("One or more simulation profiles are unsupported.");
  }

  return {
    modeId: modeId.trim(),
    schemaVersion: Number(schemaVersion),
    reportScope,
    profileIds: uniqueProfileIds,
  };
}

function isSimulationReportScope(
  value: unknown,
): value is SimulationReportScope {
  return value === "public" || value === "private" || value === "all";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
