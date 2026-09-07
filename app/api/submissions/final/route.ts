import { finalFeedback } from "@/app/lib/final-feedback";
import {
  fallbackStatus,
  EventPhaseError,
  getFallbackSubmissionScore,
  ParticipantValidationError,
  RealLlmEvaluationError,
  SubmissionLimitError,
  SubmissionStorageError,
  submitToSupabase,
} from "@/app/lib/supabase/submission-workflow";
import { verifyParticipantSessionToken } from "@/app/lib/supabase/participant-session-token";
import type { SubmitScoreResponse } from "@/app/lib/supabase/submission-workflow";
import { MAX_PROMPT_CHARS, promptTooLongMessage } from "@/app/lib/prompt-limits";

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key") || undefined;
  if (idempotencyKey && (idempotencyKey.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(idempotencyKey))) {
    return Response.json({ error: "Invalid idempotency key." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);

  if (!isSubmissionRequest(body)) {
    return Response.json(
      { error: "Expected participantCode, participantToken, and prompt strings." },
      { status: 400 },
    );
  }

  const verifiedSession = verifyParticipantSessionToken(body.participantToken);

  if (verifiedSession?.participantCode !== body.participantCode.trim().toUpperCase()) {
    return Response.json(
      { error: "Participant session is invalid. Return home and enter your access code." },
      { status: 401 },
    );
  }

  if (body.prompt.length > MAX_PROMPT_CHARS) {
    return Response.json({ error: promptTooLongMessage }, { status: 413 });
  }

  try {
    const result = await submitToSupabase({
      kind: "final",
      participantCode: verifiedSession.participantCode,
      prompt: body.prompt,
      idempotencyKey,
    });

    return Response.json(toFinalClientResponse(result));
  } catch (error) {
    if (error instanceof SubmissionLimitError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof EventPhaseError) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ParticipantValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof RealLlmEvaluationError) {
      return Response.json({ error: error.message }, { status: 502 });
    }

    if (error instanceof SubmissionStorageError) {
      console.error("[submit-final] Storage failure", error.detail);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const message = error instanceof Error ? error.message : String(error);

    if (process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      console.error("[submit-final] Supabase submission unavailable", message);

      return Response.json(
        {
          error:
            "Final Submission is temporarily unavailable. Please try again or contact the organizer.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      toFinalClientResponse({
        ...fallbackStatus(message),
        ...getFallbackSubmissionScore("final", body.prompt),
      }),
    );
  }
}

function toFinalClientResponse(result: SubmitScoreResponse) {
  return {
    source: result.source,
    fallbackReason: result.fallbackReason,
    publicSubmissionLimit: result.publicSubmissionLimit,
    publicSubmissionsUsed: result.publicSubmissionsUsed,
    remainingPublicSubmissions: result.remainingPublicSubmissions,
    latestPublicScore: result.latestPublicScore,
    finalSubmissionUsed: result.finalSubmissionUsed,
    finalScore: result.finalScore,
    kind: result.kind,
    evaluationMode: result.evaluationMode,
    model: result.model,
    score: result.score,
    correctFields: result.correctFields,
    totalFields: result.totalFields,
    feedback: finalFeedback(result),
  };
}

function isSubmissionRequest(
  value: unknown,
): value is { participantCode: string; participantToken: string; prompt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "participantCode" in value &&
    "participantToken" in value &&
    "prompt" in value &&
    typeof value.participantCode === "string" &&
    value.participantCode.trim().length > 0 &&
    typeof value.participantToken === "string" &&
    value.participantToken.trim().length > 0 &&
    typeof value.prompt === "string"
  );
}
