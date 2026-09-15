import {withAdminReadContext} from "@/app/lib/db/admin-page-snapshot";
import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import {
  clearAdminSimulationData,
  listAdminSimulationBatches,
  SimulationDataUnavailableError,
  SimulationPersistenceError,
} from "@/app/lib/supabase/admin-simulations";

async function scopedGet() {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    return Response.json(
      await listAdminSimulationBatches(createDatabase()),
    );
  } catch (error) {
    const message = error instanceof SimulationDataUnavailableError
      ? error.message
      : "Simulation history is temporarily unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}

async function scopedDelete(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (body?.confirmation !== "CLEAR SIMULATIONS") {
    return Response.json(
      { error: "Type CLEAR SIMULATIONS to confirm." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await clearAdminSimulationData(createDatabase()),
    );
  } catch (error) {
    const message = error instanceof SimulationPersistenceError
      ? error.message
      : "Simulation data could not be cleared.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const DELETE = (request: Request) => withActiveContest(request, scopedDelete);

export const GET = (request: Request) => withAdminReadContext(request, () => scopedGet());
