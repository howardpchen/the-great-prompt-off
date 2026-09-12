import { createDatabase } from "@/app/lib/supabase/admin";
import { getActiveChallenge, getSupabaseAnswerKeysForSplit, getSupabaseSubmissionStatus } from "@/app/lib/supabase/submission-workflow";
import { verifyParticipantSessionToken } from "@/app/lib/supabase/participant-session-token";
import { resolveChallengeMode } from "@/app/lib/schema-storage";
import { evaluateAnswerKeyReports, summarizeReportResults } from "@/app/lib/mock-evaluation";
import { shouldUseRealLlm } from "@/app/lib/openrouter";
export async function GET(request: Request) {
  const session = verifyParticipantSessionToken(request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "");
  if (!session) return Response.json({ error: "Team session required." }, { status: 401 });
  try {
    await getSupabaseSubmissionStatus(session.participantCode); // also verifies account active
    const db = createDatabase();
    const challenge = await getActiveChallenge(db);
    const mode = resolveChallengeMode(challenge.mode_id, challenge.schema_version, challenge.contest_schema);
    if (!mode.education) return Response.json({ error: "Not an educational contest." }, { status: 404 });
    if (challenge.event_phase === "not_started") return Response.json({ baseline: null, revealed: false }, { headers: { "Cache-Control": "no-store" } });
    // This endpoint NEVER initiates model calls. Paid common baselines require organizer calibration.
    if (shouldUseRealLlm()) return Response.json({ baseline: null, simulated: false, message: "Common real-model baseline has not been calibrated. No score is implied." }, { headers: { "Cache-Control": "no-store" } });
    const publicCases = await getSupabaseAnswerKeysForSplit(db, challenge.id, "public", mode);
    const results = evaluateAnswerKeyReports(publicCases, mode.education.baselineInstructions, mode);
    const baseline = summarizeReportResults(results);
    const revealed = challenge.event_phase === "ended";
    let hiddenBaseline = null;
    if (revealed) {
      const cases = await getSupabaseAnswerKeysForSplit(db, challenge.id, "private", mode);
      hiddenBaseline = summarizeReportResults(evaluateAnswerKeyReports(cases, mode.education.baselineInstructions, mode));
    }
    return Response.json({ baseline, hiddenBaseline, reportCount: publicCases.length, simulated: true, revealed, pipeline: mode.education.pipeline, schemaVersion: mode.version }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Educational summary unavailable." }, { status: 503 }); }
}
