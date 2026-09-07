import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import { validateAdminChallengeSchema } from "@/app/lib/supabase/admin-challenge-schema-route";

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
    const result = await validateAdminChallengeSchema(
      createDatabase(),
      body?.modeId,
      body?.schemaVersion,
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate the challenge schema.";
    const isSafeValidationError =
      message.includes("mode") ||
      message.includes("schema") ||
      message.includes("answer key");
    if (!isSafeValidationError) {
      console.error("[admin-challenge-schema-validation] Validation failed", message);
    }
    return Response.json(
      { error: isSafeValidationError ? message : "Could not validate the challenge schema." },
      { status: isSafeValidationError ? 400 : 500 },
    );
  }
}

