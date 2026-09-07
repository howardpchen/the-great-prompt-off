import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/supabase/admin";
import {
  assertChallengeConfigurationMutable,
  ChallengeConfigurationLockedError,
  CHALLENGE_CONFIGURATION_LOCK_MESSAGE,
} from "@/app/lib/supabase/admin-challenge";
import { isApprovedEvaluationModel } from "@/app/lib/model-options";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const clear =
    typeof body === "object" && body !== null && "clear" in body && body.clear === true;

  let evaluationModel: string | null = null;

  if (!clear) {
    const model =
      typeof body === "object" && body !== null && "model" in body
        ? body.model
        : typeof body === "object" && body !== null && "evaluation_model" in body
          ? body.evaluation_model
          : null;

    if (typeof model !== "string") {
      return Response.json(
        { error: "Choose a model or clear the challenge override." },
        { status: 400 },
      );
    }

    if (!isApprovedEvaluationModel(model)) {
      return Response.json(
        { error: "Choose one of the approved evaluation models." },
        { status: 400 },
      );
    }

    evaluationModel = model;
  }

  try {
    const supabase = createDatabase();
    const { data: challenge, error: challengeError } = await supabase.execute<{ id: string }>({ table: "challenges", columns: "id", single: "single", operation: "select", where: [["is_active", "eq", true]] });

    if (challengeError || !challenge) {
      console.error(
        "[admin-evaluation-model] Active challenge lookup failed",
        challengeError?.message || "No active challenge",
      );
      return Response.json(
        { error: "Could not update the evaluation model. No active challenge was found." },
        { status: 500 },
      );
    }

    await assertChallengeConfigurationMutable(supabase, challenge.id);

    const { data, error } = await supabase.execute<{ evaluation_model: string | null }>({ table: "challenges", values: { evaluation_model: evaluationModel }, columns: "evaluation_model", single: "single", operation: "update", where: [["is_active", "eq", true]] });

    if (error) {
      if (
        error.code === "55000" ||
        error.message.toLowerCase().includes("first successful submission")
      ) {
        return Response.json(
          { error: CHALLENGE_CONFIGURATION_LOCK_MESSAGE },
          { status: 409 },
        );
      }
      console.error("[admin-evaluation-model] Update failed", error.message);
      return Response.json(
        { error: "Could not update the evaluation model. Verify the model migration is installed." },
        { status: 500 },
      );
    }

    return Response.json({ evaluationModel: data.evaluation_model });
  } catch (error) {
    if (error instanceof ChallengeConfigurationLockedError) {
      return Response.json(
        { error: CHALLENGE_CONFIGURATION_LOCK_MESSAGE },
        { status: 409 },
      );
    }
    console.error(
      "[admin-evaluation-model] Request failed",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { error: "Could not update the evaluation model. Please try again." },
      { status: 500 },
    );
  }
}
