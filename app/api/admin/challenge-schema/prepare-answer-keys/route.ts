import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import { prepareAdminAnswerKeyImport } from "@/app/lib/supabase/admin-challenge-schema-route";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  try {
    const result = await prepareAdminAnswerKeyImport(
      createDatabase(),
      payload,
    );
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare answer-key import.";
    const isSafeInputError =
      message.includes("challenge mode") ||
      message.includes("schema version") ||
      message.includes("preparation path") ||
      message.includes("already exist") ||
      message.includes("import") ||
      message.includes("write option") ||
      message.includes("overwrite option") ||
      message.includes("provenance") ||
      message.includes("adjudicat") ||
      message.includes("batch ID") ||
      message.includes("notes");
    const isSafeStorageError = message === "Could not write twelve-field answer keys.";
    const safeMessage = isSafeInputError || isSafeStorageError
      ? message
      : "Could not prepare answer-key import.";
    if (safeMessage === "Could not prepare answer-key import.") {
      console.error("[admin-answer-key-preparation] Preparation failed", message);
    }
    return Response.json(
      { error: safeMessage },
      { status: isSafeInputError ? 400 : 500 },
    );
  }
}
