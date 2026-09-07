import { createDatabase } from "@/app/lib/supabase/admin";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import {
  clearAdminSimulationReference,
  getAdminSimulationReferenceData,
  setAdminSimulationReference,
} from "@/app/lib/supabase/admin-simulation-references";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
  SimulationPersistenceError,
} from "@/app/lib/supabase/admin-simulations";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    return Response.json(
      await getAdminSimulationReferenceData(createDatabase()),
    );
  } catch (error) {
    return referenceError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  try {
    return Response.json(
      await setAdminSimulationReference(
        createDatabase(),
        payload,
      ),
    );
  } catch (error) {
    return referenceError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (payload?.confirmation !== "CLEAR REFERENCE") {
    return Response.json(
      { error: "Type CLEAR REFERENCE to confirm." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await clearAdminSimulationReference(createDatabase()),
    );
  } catch (error) {
    return referenceError(error);
  }
}

function referenceError(error: unknown) {
  if (error instanceof SimulationInputError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof SimulationNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof SimulationDataUnavailableError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof SimulationPersistenceError) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(
    { error: "Simulation reference data is temporarily unavailable." },
    { status: 500 },
  );
}
