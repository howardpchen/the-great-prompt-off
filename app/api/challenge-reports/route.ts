import {canViewPracticeReports} from "../../lib/event-phase";
import {createDatabase} from "../../lib/db/database";
import {getActiveChallenge} from "../../lib/supabase/submission-workflow";
import { getPublicChallengeReports } from "../../lib/challenge-data";
import { verifyParticipantSessionToken } from "../../lib/supabase/participant-session-token";
import { validateParticipantSession } from "../../lib/supabase/participant-validation";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "";
  const session = verifyParticipantSessionToken(token);
  if (!session) return Response.json({ error: "Participant session required." }, { status: 401, headers });
  const participant = await validateParticipantSession(session.participantCode, token);
  if (!participant.valid) return Response.json({ error: "Participant session required." }, { status: 401, headers });
  try {
    const challenge=await getActiveChallenge(createDatabase());
    if (!canViewPracticeReports(challenge.event_phase)) return Response.json({reports:[]},{headers});
    return Response.json({ reports: await getPublicChallengeReports(challenge.id) }, { headers });
  } catch { return Response.json({error:"Practice reports unavailable."},{status:503,headers}); }
}
