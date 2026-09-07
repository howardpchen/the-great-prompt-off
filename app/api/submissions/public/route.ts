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
    return Response.json(
      await submitToSupabase({
        kind: "public",
        participantCode: verifiedSession.participantCode,
        prompt: body.prompt,
        idempotencyKey,
      }),
    );
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
      console.error("[submit-public] Storage failure", error.detail);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const message = error instanceof Error ? error.message : String(error);

    if (process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      console.error("[submit-public] Supabase submission unavailable", message);

      return Response.json(
        {
          error:
            "Test Attempts are temporarily unavailable. Please try again or contact the organizer.",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ...fallbackStatus(message),
      ...getFallbackSubmissionScore("public", body.prompt),
    });
  }
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
