import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import { callAdminChallengeSchemaUpdate } from "@/app/lib/supabase/admin-challenge-schema-route";

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
    const supabase = createDatabase();
    const result = await callAdminChallengeSchemaUpdate(supabase, body?.modeId, body?.schemaVersion);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update challenge schema.";
    const status = message === "Admin session required."
      ? 401
      : message.includes("locked") || message.includes("Reset workshop")
        ? 409
        : message.includes("not available") ||
            message.includes("not supported") ||
            message.includes("answer key") ||
            message.includes("clinically ready")
          ? 400
          : 500;
    console.error("[admin-challenge-schema] Update failed", message);
    return Response.json({ error: status === 500 ? "Could not update the challenge schema. Please try again." : message }, { status });
  }
}
