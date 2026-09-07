import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import {
  deleteAdminSimulationBatch,
  getAdminSimulationBatch,
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
  SimulationPersistenceError,
} from "@/app/lib/supabase/admin-simulations";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const { batchId } = await params;
  try {
    return Response.json(
      await getAdminSimulationBatch(createDatabase(), batchId),
    );
  } catch (error) {
    return simulationReadError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const { batchId } = await params;
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (body?.confirmation !== batchId) {
    return Response.json(
      { error: "Type the simulation batch ID to confirm deletion." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await deleteAdminSimulationBatch(createDatabase(), batchId),
    );
  } catch (error) {
    if (error instanceof SimulationPersistenceError) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return simulationReadError(error);
  }
}

function simulationReadError(error: unknown) {
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
    { error: "Simulation summary is temporarily unavailable." },
    { status: 500 },
  );
}
