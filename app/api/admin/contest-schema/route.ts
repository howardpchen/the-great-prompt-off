import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import {
  contestSchemaState,
  saveContestSchema,
} from "@/app/lib/db/contest-schema";
export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }
  try {
    return Response.json(await contestSchemaState(createDatabase()));
  } catch {
    return Response.json(
      { error: "Could not load contest schema." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }
  const text = await request.text();
  if (text.length > 2_000_000)
    return Response.json({ error: "Import too large." }, { status: 413 });
  try {
    return Response.json(
      await saveContestSchema(createDatabase(), JSON.parse(text)),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid schema request.";
    return Response.json({ error: message }, { status: 400 });
  }
}
