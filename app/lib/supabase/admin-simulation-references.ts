import "server-only";

import type {
  SimulationAnalyticsBatch,
  SimulationAnalyticsRun,
} from "@/app/lib/simulation-analytics";
import {
  buildSimulationRegression,
  simulationRegressionThresholds,
} from "@/app/lib/simulation-regression";
import { createDatabase } from "./admin";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
  SimulationPersistenceError,
} from "./admin-simulations";
import { getActiveChallenge } from "./submission-workflow";

type SimulationReferenceBatch = SimulationAnalyticsBatch & {
  is_reference: boolean;
  reference_label: string | null;
  reference_notes: string | null;
};

export async function getAdminSimulationReferenceData(
  supabase: ReturnType<typeof createDatabase>,
) {
  const challenge = await getActiveChallenge(supabase);
  const [{ data: reference, error: referenceError }, { data: recent, error: recentError }] =
    await Promise.all([
      supabase.execute<SimulationReferenceBatch>({ table: "simulation_batches", columns: referenceBatchColumns, single: "maybeSingle", operation: "select", where: [["challenge_id", "eq", challenge.id],["is_reference", "eq", true]] }),
      supabase.execute<SimulationReferenceBatch[]>({ table: "simulation_batches", columns: referenceBatchColumns, limit: 10, operation: "select", where: [["challenge_id", "eq", challenge.id],["status", "eq", "completed"]], order: [["created_at", { ascending: false }]] }),
    ]);

  if (referenceError || recentError) {
    throw new SimulationDataUnavailableError(
      "Simulation reference data is temporarily unavailable.",
    );
  }
  if (!reference) {
    return {
      ok: true as const,
      deterministic: true as const,
      simulationOnly: true as const,
      reference: null,
      thresholds: simulationRegressionThresholds,
      comparisons: [],
    };
  }

  const candidates = (recent ?? []).filter((batch) => batch.id !== reference.id);
  const batchIds = [reference.id, ...candidates.map((batch) => batch.id)];
  const { data: runs, error: runError } = await supabase.execute<SimulationAnalyticsRun[]>({ table: "simulation_runs", columns: "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at", operation: "select", where: [["simulation_batch_id", "in", batchIds]] });

  if (runError) {
    throw new SimulationDataUnavailableError(
      "Simulation reference comparisons are temporarily unavailable.",
    );
  }

  const allRuns = runs ?? [];
  const referenceRuns = allRuns.filter(
    (run) => run.simulation_batch_id === reference.id,
  );

  return {
    ok: true as const,
    deterministic: true as const,
    simulationOnly: true as const,
    reference: safeReference(reference, referenceRuns),
    thresholds: simulationRegressionThresholds,
    comparisons: candidates.map((candidate) =>
      buildSimulationRegression(
        reference,
        referenceRuns,
        candidate,
        allRuns.filter((run) => run.simulation_batch_id === candidate.id),
      ),
    ),
  };
}

export async function setAdminSimulationReference(
  supabase: ReturnType<typeof createDatabase>,
  payload: unknown,
) {
  const input = parseReferenceInput(payload);
  const challenge = await getActiveChallenge(supabase);
  const { data: batch, error: batchError } = await supabase.execute<{ id: string; status: string; evaluator_type: string }>({ table: "simulation_batches", columns: "id, status, evaluator_type", single: "maybeSingle", operation: "select", where: [["id", "eq", input.batchId],["challenge_id", "eq", challenge.id]] });

  if (batchError) {
    throw new SimulationDataUnavailableError(
      "Simulation batch validation is temporarily unavailable.",
    );
  }
  if (!batch) {
    throw new SimulationNotFoundError("Simulation batch not found.");
  }
  if (batch.status !== "completed") {
    throw new SimulationInputError(
      "Only completed simulation batches can be references.",
    );
  }
  if (batch.evaluator_type !== "deterministic_mock") {
    throw new SimulationInputError(
      "Only deterministic simulation batches can be references.",
    );
  }

  const { error } = await supabase.rpc("admin_set_simulation_reference", {
    target_challenge_id: challenge.id,
    target_batch_id: batch.id,
    target_reference_label: input.label,
    target_reference_notes: input.notes,
  });
  if (error) {
    console.error("[admin-simulation-reference] Reference update failed", {
      batchId: batch.id,
      message: error.message,
    });
    throw new SimulationPersistenceError(
      "The simulation reference could not be updated.",
    );
  }

  return { ok: true as const, referenceBatchId: batch.id };
}

export async function clearAdminSimulationReference(
  supabase: ReturnType<typeof createDatabase>,
) {
  const challenge = await getActiveChallenge(supabase);
  const { error } = await supabase.rpc("admin_clear_simulation_reference", {
    target_challenge_id: challenge.id,
  });
  if (error) {
    console.error("[admin-simulation-reference] Reference clear failed", {
      message: error.message,
    });
    throw new SimulationPersistenceError(
      "The simulation reference could not be cleared.",
    );
  }

  return { ok: true as const };
}

const referenceBatchColumns =
  "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at, is_reference, reference_label, reference_notes";

function safeReference(
  batch: SimulationReferenceBatch,
  runs: readonly SimulationAnalyticsRun[],
) {
  return {
    batchId: batch.id,
    label: batch.reference_label,
    notes: batch.reference_notes,
    modeId: batch.mode_id,
    schemaVersion: batch.schema_version,
    evaluatorType: batch.evaluator_type,
    reportScope: batch.report_scope,
    reportCount: batch.report_count,
    fieldCount: batch.field_count,
    totalEvaluations: batch.total_evaluations,
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
    profiles: runs.map((run) => ({
      profileId: run.profile_id,
      profileVersion: run.profile_version,
      profileLabel: run.profile_label,
    })),
    disclaimer:
      "Deterministic simulation regression checking is not clinical validation.",
  };
}

function parseReferenceInput(payload: unknown) {
  if (!isPlainObject(payload)) {
    throw new SimulationInputError("A reference request body is required.");
  }
  const batchId = payload.batchId;
  const label = optionalText(payload.label, 80, "Reference label");
  const notes = optionalText(payload.notes, 240, "Reference notes");

  if (typeof batchId !== "string" || !isUuid(batchId)) {
    throw new SimulationInputError("A valid simulation batch ID is required.");
  }

  return { batchId, label, notes };
}

function optionalText(value: unknown, maxLength: number, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new SimulationInputError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return value.trim() || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
