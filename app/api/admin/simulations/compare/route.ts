import { createDatabase } from "@/app/lib/supabase/admin";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { compareAdminSimulationBatches } from "@/app/lib/supabase/admin-simulation-analytics";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
} from "@/app/lib/supabase/admin-simulations";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const leftBatchId = searchParams.get("leftBatchId") ?? "";
  const rightBatchId = searchParams.get("rightBatchId") ?? "";

  try {
    return Response.json(
      await compareAdminSimulationBatches(
        createDatabase(),
        leftBatchId,
        rightBatchId,
      ),
    );
  } catch (error) {
    if (error instanceof SimulationInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SimulationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SimulationDataUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return Response.json(
      { error: "Simulation comparison is temporarily unavailable." },
      { status: 500 },
    );
  }
}
