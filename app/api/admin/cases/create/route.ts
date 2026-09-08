import { createAdminCase } from "@/app/lib/supabase/admin-cases";
import type { AdminCaseSplit } from "@/app/lib/supabase/admin-cases";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      answerKey?: unknown;
      filename?: unknown;
      reportText?: unknown;
      split?: unknown;
    } | null;

    if (!body) {
      return Response.json({ error: "Request body is required." }, { status: 400 });
    }

    await createAdminCase({
      filename: typeof body.filename === "string" ? body.filename : "",
      split: typeof body.split === "string" ? (body.split as AdminCaseSplit) : ("" as AdminCaseSplit),
      reportText: typeof body.reportText === "string" ? body.reportText : "",
      answerKey: body.answerKey,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Case creation failed." },
      { status: 400 },
    );
  }
}
