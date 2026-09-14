import { createDatabase } from "../../lib/supabase/admin";
import { getActiveChallenge } from "../../lib/supabase/submission-workflow";
import { verifyParticipantSessionToken } from "../../lib/supabase/participant-session-token";
import { isEducationContest } from "../../lib/education-policy";
import { readTeamHistory } from "../../lib/db/team-history";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const session = verifyParticipantSessionToken(request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "");
  if (!session) return Response.json({ error: "Team session required." }, { status: 401, headers });
  try {
    const db = createDatabase();
    const challenge = await getActiveChallenge(db);
    if (!isEducationContest(challenge.contest_schema)) return Response.json({ error: "Not an educational contest." }, { status: 404, headers });
    // Identity comes only from the signed session, never query parameters or body.
    const result = await readTeamHistory(db, challenge.id, session.participantCode);
    if (!result) return Response.json({ error: "Team is inactive or unavailable." }, { status: 403, headers });
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "Team history unavailable." }, { status: 503, headers }); }
}
