import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { isEventPhase } from "@/app/lib/event-phase";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { updateActiveChallengePhase } from "@/app/lib/supabase/admin-dashboard";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const phase = typeof body?.phase === "string" ? body.phase : null;

  if (!isEventPhase(phase)) {
    return Response.json({ error: "Invalid event phase." }, { status: 400 });
  }

  try {
    await updateActiveChallengePhase(phase);

    return Response.json({ ok: true, eventPhase: phase });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update phase.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
