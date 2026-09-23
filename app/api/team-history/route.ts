import { createDatabase } from "../../lib/supabase/admin";
import { getActiveChallenge } from "../../lib/supabase/submission-workflow";
import { verifyParticipantSessionToken } from "../../lib/supabase/participant-session-token";
import { isEducationContest } from "../../lib/education-policy";
import { readTeamHistory, readPublicHistoryResult } from "../../lib/db/team-history";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const session = verifyParticipantSessionToken(request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "");
  if (!session) return Response.json({ error: "Participant session required." }, { status: 401, headers });
  try {
    const db = createDatabase();
    const challenge = await getActiveChallenge(db);
    if (!isEducationContest(challenge.contest_schema)) return Response.json({ error: "Challenge mode is not enabled for this contest." }, { status: 404, headers });
    const submissionId = new URL(request.url).searchParams.get("submission");
    if (submissionId !== null) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) return Response.json({error: "Invalid submission ID."}, {status: 400, headers});
      const result = await readPublicHistoryResult(db, challenge.id, session.participantCode, submissionId);
      return result ? Response.json(result, {headers}) : Response.json({error: "Public result unavailable."}, {status: 404, headers});
    }
    // Identity comes only from the signed session, never query parameters or body.
    const result = await readTeamHistory(db, challenge.id, session.participantCode);
    if (!result) return Response.json({ error: "Participant account is inactive or unavailable." }, { status: 403, headers });
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "Submission history unavailable." }, { status: 503, headers }); }
}
