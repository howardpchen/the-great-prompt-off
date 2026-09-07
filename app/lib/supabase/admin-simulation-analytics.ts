import "server-only";

import {
  buildSimulationAnalytics,
  buildSimulationBatchComparison,
  type SimulationAnalyticsBatch,
  type SimulationAnalyticsRun,
} from "@/app/lib/simulation-analytics";
import { createDatabase } from "./admin";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
} from "./admin-simulations";
import { getActiveChallenge } from "./submission-workflow";

export async function getAdminSimulationAnalytics(
  supabase: ReturnType<typeof createDatabase>,
) {
  const challenge = await getActiveChallenge(supabase);
  const { data: batches, error: batchError } = await supabase.execute<SimulationAnalyticsBatch[]>({ table: "simulation_batches", columns: "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at", limit: 100, operation: "select", where: [["challenge_id", "eq", challenge.id]], order: [["created_at", { ascending: false }]] });

  if (batchError) {
    throw new SimulationDataUnavailableError(
      "Simulation analytics are temporarily unavailable.",
    );
  }

  if (!batches?.length) {
    return buildSimulationAnalytics([], []);
  }

  const { data: runs, error: runError } = await supabase.execute<SimulationAnalyticsRun[]>({ table: "simulation_runs", columns: "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at", operation: "select", where: [["simulation_batch_id", "in", batches.map((batch) => batch.id)]] });

  if (runError) {
    throw new SimulationDataUnavailableError(
      "Simulation analytics are temporarily unavailable.",
    );
  }

  return buildSimulationAnalytics(batches, runs ?? []);
}

export async function compareAdminSimulationBatches(
  supabase: ReturnType<typeof createDatabase>,
  leftBatchId: string,
  rightBatchId: string,
) {
  if (leftBatchId === rightBatchId) {
    throw new SimulationInputError("Select two different simulation batches.");
  }

  const challenge = await getActiveChallenge(supabase);
  const [leftBatch, rightBatch] = await Promise.all([
    getChallengeSimulationBatch(supabase, challenge.id, leftBatchId),
    getChallengeSimulationBatch(supabase, challenge.id, rightBatchId),
  ]);
  if (leftBatch.status !== "completed" || rightBatch.status !== "completed") {
    throw new SimulationInputError(
      "Only completed simulation batches can be compared.",
    );
  }
  const { data: runs, error } = await supabase.execute<SimulationAnalyticsRun[]>({ table: "simulation_runs", columns: "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at", operation: "select", where: [["simulation_batch_id", "in", [leftBatch.id, rightBatch.id]]] });

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation comparison is temporarily unavailable.",
    );
  }

  return buildSimulationBatchComparison(
    leftBatch,
    (runs ?? []).filter((run) => run.simulation_batch_id === leftBatch.id),
    rightBatch,
    (runs ?? []).filter((run) => run.simulation_batch_id === rightBatch.id),
  );
}

async function getChallengeSimulationBatch(
  supabase: ReturnType<typeof createDatabase>,
  challengeId: string,
  batchId: string,
) {
  if (!isUuid(batchId)) {
    throw new SimulationInputError("A valid simulation batch ID is required.");
  }

  const { data, error } = await supabase.execute<SimulationAnalyticsBatch>({ table: "simulation_batches", columns: "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at", single: "maybeSingle", operation: "select", where: [["id", "eq", batchId],["challenge_id", "eq", challengeId]] });

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation comparison is temporarily unavailable.",
    );
  }
  if (!data) {
    throw new SimulationNotFoundError("Simulation batch not found.");
  }

  return data;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
