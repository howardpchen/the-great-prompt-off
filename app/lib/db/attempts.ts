import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Database } from "./database";
export class AttemptAdmissionError extends Error {}
export type Reservation = {
  id: string;
  attempt_number: number;
  status: string;
  response: unknown;
  prompt_hash: string;
};
export async function reserveAttempt(
  db: Database,
  input: {
    challengeId: string;
    participantId: string;
    kind: "public" | "final";
    prompt: string;
    idempotencyKey?: string;
  },
) {
  const key = input.idempotencyKey || randomUUID();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key))
    throw new AttemptAdmissionError("Invalid idempotency key");
  const hash = createHash("sha256").update(input.prompt).digest("hex");
  return db.transaction(async (tx) => {
    // Always lock challenge before participant; serializes admission with phase changes.
    const [challenge] = await tx.sql<{
      event_phase: string;
      public_submission_limit: number;
      final_submission_limit: number;
    }>(
      "SELECT event_phase,public_submission_limit,final_submission_limit FROM challenges WHERE id=$1 AND is_active FOR UPDATE",
      [input.challengeId],
    );
    const [participant] = await tx.sql<{
      is_active: boolean;
      participant_code: string;
    }>(
      "SELECT is_active,participant_code FROM participants WHERE id=$1 FOR UPDATE",
      [input.participantId],
    );
    if (!challenge || !participant?.is_active)
      throw new AttemptAdmissionError("Participant or challenge is inactive.");
    const [prior] = await tx.sql<Reservation>(
      "SELECT * FROM attempt_reservations WHERE challenge_id=$1 AND participant_id=$2 AND kind=$3 AND idempotency_key=$4",
      [input.challengeId, input.participantId, input.kind, key],
    );
    if (prior) {
      if (prior.prompt_hash !== hash)
        throw new AttemptAdmissionError(
          "Idempotency key was already used for a different prompt.",
        );
      if (prior.status === "completed") return prior;
      if (prior.status === "pending")
        throw new AttemptAdmissionError("This attempt is already processing.");
    }
    if (
      challenge.event_phase !==
      (input.kind === "public" ? "practice_open" : "final_open")
    )
      throw new AttemptAdmissionError("Submissions are not open right now.");
    const [override] = await tx.sql<{ extra_public_attempts: number }>(
      "SELECT extra_public_attempts FROM participant_attempt_overrides WHERE participant_code=$1",
      [participant.participant_code],
    );
    const [counts] = await tx.sql<{ used: number; next: number }>(
      `SELECT count(*)::integer AS used, COALESCE(max(attempt_number),0)::integer+1 AS next FROM (SELECT attempt_number FROM submissions WHERE challenge_id=$1 AND participant_id=$2 AND submission_type=$3 UNION ALL SELECT attempt_number FROM attempt_reservations WHERE challenge_id=$1 AND participant_id=$2 AND kind=$3 AND status='pending') attempts`,
      [input.challengeId, input.participantId, input.kind],
    );
    const limit =
      input.kind === "public"
        ? challenge.public_submission_limit +
          (override?.extra_public_attempts || 0)
        : challenge.final_submission_limit;
    if (counts.used >= limit)
      throw new AttemptAdmissionError("Submission limit reached.");
    const [reservation] = await tx.sql<Reservation>(
      `INSERT INTO attempt_reservations(challenge_id,participant_id,kind,idempotency_key,prompt_hash,attempt_number) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(challenge_id,participant_id,kind,idempotency_key) DO UPDATE SET status='pending',attempt_number=EXCLUDED.attempt_number,created_at=now(),completed_at=NULL RETURNING *`,
      [
        input.challengeId,
        input.participantId,
        input.kind,
        key,
        hash,
        counts.next,
      ],
    );
    return reservation;
  });
}
export async function failReservation(db: Database, id: string) {
  await db.sql(
    "UPDATE attempt_reservations SET status='failed',completed_at=now() WHERE id=$1 AND status='pending'",
    [id],
  );
}
