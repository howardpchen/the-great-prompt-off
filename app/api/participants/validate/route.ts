import { validateParticipantAccessCode, validateParticipantSession } from "@/app/lib/supabase/participant-validation";
import { isAllowedWrite, privateResponseHeaders, readLoginBody, takeLoginAttempt } from "@/app/lib/request-security";

export async function POST(request: Request) {
  const respond = (body: unknown, status = 200, extra = {}) => Response.json(body, { status, headers: { ...privateResponseHeaders, ...extra } });
  if (!isAllowedWrite(request)) return respond({ error: "Same-origin request required." }, 403);
  const body = await readLoginBody(request);
  if (!body) return respond({ error: "Expected a bounded JSON object." }, 400);
  const { participantCode, participantToken, accessCode } = body;
  if (typeof participantCode === "string" && typeof participantToken === "string") {
    return respond(await validateParticipantSession(participantCode, participantToken));
  }
  const retry = takeLoginAttempt("participant");
  if (retry) return respond({ error: "Too many login attempts. Try again shortly." }, 429, { "Retry-After": String(retry) });
  if (typeof accessCode !== "string" || accessCode.length > 128) return respond({ error: "Access code required." }, 400);
  return respond(await validateParticipantAccessCode(accessCode));
}
