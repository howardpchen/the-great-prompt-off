import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { resetWorkshopRunData } from "@/app/lib/supabase/admin-dashboard";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
    } | null;

    if (body?.confirmation !== "RESET") {
      return Response.json(
        { error: 'Type "RESET" to confirm this admin-only reset.' },
        { status: 400 },
      );
    }

    await resetWorkshopRunData();

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin reset failed.";

    return Response.json(
      { error: message },
      { status: message === "Admin session required." ? 401 : 500 },
    );
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
