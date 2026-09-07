import "server-only";

import type { SimulationAnalyticsRun } from "@/app/lib/simulation-analytics";
import {
  buildSimulationCsv,
  type SimulationBatchWithSchema,
} from "@/app/lib/simulation-reproducibility";
import { createDatabase } from "./admin";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
} from "./admin-simulations";
import { getActiveChallenge } from "./submission-workflow";

export async function getAdminSimulationCsvExport(
  supabase: ReturnType<typeof createDatabase>,
  batchId?: string | null,
) {
  if (batchId && !isUuid(batchId)) {
    throw new SimulationInputError("A valid simulation batch ID is required.");
  }

  const challenge = await getActiveChallenge(supabase);
  const {data:batches,error:batchError} = await supabase.execute<SimulationBatchWithSchema[]>({table: "simulation_batches",columns:'id, mode_id, schema_version, schema_snapshot, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at',where:[["challenge_id", "eq", challenge.id],['status','eq','completed'],...(batchId ? [['id','eq',batchId] as const] : [])],order:[['created_at',{ascending:false}]],limit:batchId ? 1 : 100});
  if (batchError) {
    throw new SimulationDataUnavailableError(
      "Simulation export is temporarily unavailable.",
    );
  }
  if (batchId && !batches?.length) {
    throw new SimulationNotFoundError("Completed simulation batch not found.");
  }

  const batchRows = batches ?? [];
  if (batchRows.length === 0) {
    return {
      csv: buildSimulationCsv([], []),
      filename: "simulation-batches.csv",
    };
  }

  const { data: runs, error: runError } = await supabase.execute<SimulationAnalyticsRun[]>({ table: "simulation_runs", columns: "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at", operation: "select", where: [["simulation_batch_id", "in", batchRows.map((batch) => batch.id)]] });

  if (runError) {
    throw new SimulationDataUnavailableError(
      "Simulation export is temporarily unavailable.",
    );
  }

  return {
    csv: buildSimulationCsv(batchRows, runs ?? []),
    filename: batchId
      ? `simulation-batch-${batchId}.csv`
      : "simulation-batches.csv",
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
