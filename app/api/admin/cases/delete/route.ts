import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { deleteAdminCase } from "@/app/lib/supabase/admin-cases";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      confirmationFilename?: unknown;
      reportId?: unknown;
    } | null;

    await deleteAdminCase({
      reportId: typeof body?.reportId === "string" ? body.reportId : "",
      confirmationFilename:
        typeof body?.confirmationFilename === "string"
          ? body.confirmationFilename
          : "",
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Case deletion failed." },
      { status: 400 },
    );
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
