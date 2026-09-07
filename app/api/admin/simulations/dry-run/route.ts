import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import {
  runAdminSimulationDryRun,
  SimulationDataUnavailableError,
  SimulationInputError,
} from "@/app/lib/supabase/admin-simulations";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  try {
    const result = await runAdminSimulationDryRun(
      createDatabase(),
      payload,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof SimulationInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof SimulationDataUnavailableError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    console.error("[admin-simulation] Dry-run failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { error: "The deterministic simulation could not be completed." },
      { status: 500 },
    );
  }
}
