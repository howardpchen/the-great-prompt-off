import { isContestId } from "@/app/lib/contest-context";
import { createDatabase } from "@/app/lib/db/database";
import { verifyParticipantSessionToken } from "@/app/lib/supabase/participant-session-token";
import { evaluationFailureMessage } from "@/app/lib/evaluation-errors";

export async function GET(request: Request) {
  const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const session=token ? verifyParticipantSessionToken(token) : null;
  if (!session) return Response.json({error:"Participant session expired. Sign in again to see your saved submission."},{status:401});
  const url=new URL(request.url);
  const contestId=url.searchParams.get("contestId");
  const requestId=url.searchParams.get("requestId");
  if (!isContestId(contestId) || !requestId || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
    return Response.json({error:"Invalid submission reference."},{status:400});
  }
  try {
    // Bound to the authenticated participant, contest, public kind AND request.
    // Never expose another participant's result, or any private/final payload.
    const [attempt]=await createDatabase().sql<{
      status:string; response:Record<string,unknown>|null; prompt_text:string|null; created_at:string;
    }>(`SELECT a.status,a.response,a.prompt_text,a.created_at FROM attempt_reservations a
      JOIN participants p ON p.id=a.participant_id
      WHERE a.challenge_id=$1 AND a.idempotency_key=$2 AND a.kind='public'
        AND p.participant_code=$3 AND p.is_active`,[contestId,requestId,session.participantCode]);
    const headers={"Cache-Control":"no-store"};
    if (!attempt) return Response.json({error:"Submission not found."},{status:404,headers});
    if (attempt.status === "completed") return Response.json({state:"completed",result:attempt.response,instructions:attempt.prompt_text},{headers});
    if (attempt.status === "failed") {
      const code = attempt.response?.failureCode === "output_format" ? "output_format" : "evaluation_failed";
      return Response.json({state:"failed",code,error:evaluationFailureMessage(code,"public")},{headers});
    }
    if (Date.now()-new Date(attempt.created_at).getTime()>25*60*1000) {
      // A process interruption is not proof that an old worker stopped. Keep the
      // reservation and require the existing organizer recovery procedure.
      return Response.json({state:"stalled",error:"This submission is taking longer than expected. Ask the organizer to check it before submitting again."},{headers});
    }
    const progress=attempt.response?.progress as {phase?:string}|undefined;
    return Response.json({state:progress?.phase ?? "queued",progress},{headers});
  } catch {
    return Response.json({error:"Reconnecting to your submission. Please wait; do not submit again."},{status:503});
  }
}
