import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { isLeaderboardVisibility } from "@/app/lib/leaderboard-visibility";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { updateActiveChallengeLeaderboardVisibility } from "@/app/lib/supabase/admin-dashboard";

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const visibility =
    typeof body?.visibility === "string" ? body.visibility : null;

  if (!isLeaderboardVisibility(visibility)) {
    return Response.json(
      { error: "Invalid leaderboard visibility." },
      { status: 400 },
    );
  }

  try {
    await updateActiveChallengeLeaderboardVisibility(visibility);

    return Response.json({ ok: true, leaderboardVisibility: visibility });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update visibility.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
