import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { runBaselineCalibration } from "@/app/lib/supabase/calibration";

async function scopedPost() {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    const result = await runBaselineCalibration();

    return Response.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[admin-calibration] Baseline calibration failed", detail);

    return Response.json(
      {
        error:
          "Baseline calibration could not complete. Check the active model, database data, and OpenRouter configuration.",
      },
      { status: 502 },
    );
  }
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
