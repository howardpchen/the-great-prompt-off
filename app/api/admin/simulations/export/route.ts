import { createDatabase } from "@/app/lib/supabase/admin";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { getAdminSimulationCsvExport } from "@/app/lib/supabase/admin-simulation-exports";
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

  const batchId = new URL(request.url).searchParams.get("batchId");

  try {
    const result = await getAdminSimulationCsvExport(
      createDatabase(),
      batchId,
    );
    return new Response(result.csv, {
      headers: {
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
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
      { error: "Simulation export is temporarily unavailable." },
      { status: 500 },
    );
  }
}
