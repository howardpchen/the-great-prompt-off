import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { grantExtraPublicAttempt } from "@/app/lib/supabase/admin-dashboard";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
      participantCode?: unknown;
    } | null;
    const participantCode =
      typeof body?.participantCode === "string"
        ? body.participantCode.trim().toUpperCase()
        : "";

    if (!participantCode || body?.confirmation !== participantCode) {
      return Response.json(
        { error: "Confirm by typing the participant code." },
        { status: 400 },
      );
    }

    const extraPublicAttempts = await grantExtraPublicAttempt(participantCode);

    return Response.json({ extraPublicAttempts, ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Grant extra Test Attempt failed.",
      },
      { status: 401 },
    );
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
