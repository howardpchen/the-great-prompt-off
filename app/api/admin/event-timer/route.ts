import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { updateActiveChallengeTimer } from "@/app/lib/supabase/admin-dashboard";

const maxLabelLength = 80;

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (typeof body?.clear === "boolean" && body.clear) {
    try {
      const result = await updateActiveChallengeTimer({
        durationMinutes: null,
        label: "",
      });

      return Response.json({ ok: true, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not clear event timer.";

      return Response.json({ error: message }, { status: 500 });
    }
  }

  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const durationMinutes = Number(body?.durationMinutes);

  if (label.length > maxLabelLength) {
    return Response.json(
      { error: `Timer label must be ${maxLabelLength} characters or fewer.` },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 180
  ) {
    return Response.json(
      { error: "Timer duration must be between 1 and 180 minutes." },
      { status: 400 },
    );
  }

  try {
    const result = await updateActiveChallengeTimer({
      durationMinutes,
      label,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update event timer.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
