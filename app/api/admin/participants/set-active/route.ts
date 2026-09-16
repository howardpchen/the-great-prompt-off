import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { setParticipantActive } from "@/app/lib/supabase/admin-dashboard";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      participantCode?: unknown;
      isActive?: unknown;
    } | null;
    const participantCode =
      typeof body?.participantCode === "string" ? body.participantCode.trim() : "";

    if (!participantCode || typeof body?.isActive !== "boolean") {
      return Response.json(
        { error: "participantCode and isActive are required." },
        { status: 400 },
      );
    }

    await setParticipantActive(participantCode, body.isActive);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Status update failed." },
      { status: 401 },
    );
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
