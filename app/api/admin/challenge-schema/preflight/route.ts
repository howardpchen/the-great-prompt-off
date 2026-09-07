import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import { preflightAdminChallengeSchema } from "@/app/lib/supabase/admin-challenge-schema-route";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    modeId?: unknown;
    schemaVersion?: unknown;
  } | null;

  try {
    const result = await preflightAdminChallengeSchema(
      createDatabase(),
      body?.modeId,
      body?.schemaVersion,
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeInputError =
      message.includes("challenge mode") || message.includes("schema version");
    if (!safeInputError) {
      console.error("[admin-challenge-schema-preflight] Preflight failed", {
        message: "Server-side preflight query failed.",
      });
    }
    return Response.json(
      {
        error: safeInputError
          ? message
          : "Could not run the challenge activation preflight. Please try again.",
      },
      { status: safeInputError ? 400 : 500 },
    );
  }
}
