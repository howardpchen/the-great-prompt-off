import "server-only";
import type { Database } from "./database";
export type PracticeVersion = { id: string; attemptNumber: number; instructions: string; score: number; correctFields: number; totalFields: number; reportCount: number; submittedAt: string };
export type FinalInstructions = { instructions: string | null; status: string };
export type TeamHistory = { practice: PracticeVersion[]; final: FinalInstructions | null };
export async function readTeamHistory(db: Database, challengeId: string, participantCode: string): Promise<TeamHistory | null> {
  const [team] = await db.sql<{id:string}>("SELECT id FROM participants WHERE participant_code=$1 AND is_active", [participantCode]);
  if (!team) return null;
  // Deliberately project only PUBLIC aggregate results. Never read cached final
  // response, raw model output, references, or final scores into this endpoint.
  const practice = await db.sql<PracticeVersion>(`SELECT s.id, s.attempt_number AS "attemptNumber",
    p.prompt_text AS instructions, s.score, s.correct_fields AS "correctFields",
    s.total_fields AS "totalFields", s.report_count AS "reportCount", s.submitted_at AS "submittedAt"
    FROM submissions s JOIN prompt_runs p ON p.id=s.prompt_run_id
      AND p.participant_id=s.participant_id AND p.challenge_id=s.challenge_id
    WHERE s.challenge_id=$1 AND s.participant_id=$2 AND s.submission_type='public'
    ORDER BY s.submitted_at DESC,s.id DESC LIMIT 100`, [challengeId, team.id]);
  // On retries all hashes/text are identical; prefer a recovered non-null copy
  // for an older failed record without text. Never accept a client-selected team.
  const [final] = await db.sql<FinalInstructions>(`SELECT prompt_text AS instructions,status
    FROM attempt_reservations WHERE challenge_id=$1 AND participant_id=$2 AND kind='final'
    ORDER BY (prompt_text IS NULL),created_at DESC,id DESC LIMIT 1`, [challengeId, team.id]);
  return { practice, final: final || null };
}
