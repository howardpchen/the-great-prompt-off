import { createDatabase } from "@/app/lib/supabase/admin";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { getAdminSimulationAnalytics } from "@/app/lib/supabase/admin-simulation-analytics";
import {
  SimulationDataUnavailableError,
} from "@/app/lib/supabase/admin-simulations";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    return Response.json(
      await getAdminSimulationAnalytics(createDatabase()),
    );
  } catch (error) {
    const message = error instanceof SimulationDataUnavailableError
      ? error.message
      : "Simulation analytics are temporarily unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
