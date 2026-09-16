import { isApprovedEvaluationModel } from "../model-options";
import "server-only";
import { isEducationContest } from "../education-policy";
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
    expectedSchemaVersion?: number;
  },
) {
  const key = input.idempotencyKey || randomUUID();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key))
    throw new AttemptAdmissionError("Invalid idempotency key");
  const hash = createHash("sha256").update(input.prompt).digest("hex");
  return db.transaction(async (tx) => {
    await tx.sql("SELECT pg_advisory_xact_lock(718204,1)");
    // Always lock challenge before participant; serializes admission with phase changes.
    const [challenge] = await tx.sql<{
      event_phase: string;
      schema_version: number;
      contest_schema: unknown;
      evaluation_model: string | null;
      public_submission_limit: number;
      final_submission_limit: number;
    }>(
      "SELECT schema_version,evaluation_model,contest_schema,event_phase,public_submission_limit,final_submission_limit FROM challenges WHERE id=$1 AND is_active FOR UPDATE",
      [input.challengeId],
    );
    if (input.expectedSchemaVersion !== undefined && challenge?.schema_version !== input.expectedSchemaVersion) throw new AttemptAdmissionError("Contest changed; reload before submitting.");
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
    const education = isEducationContest(challenge.contest_schema);
    if (education && !isApprovedEvaluationModel(challenge.evaluation_model))
      throw new AttemptAdmissionError('An explicit fixed evaluation model is required for this Team Challenge contest.');
    if (education && !input.prompt.trim())
      throw new AttemptAdmissionError('Enter instructions before submitting.');
    if (education && input.kind === 'final') {
      const [locked] = await tx.sql<{prompt_hash:string}>(
        "SELECT prompt_hash FROM attempt_reservations WHERE challenge_id=$1 AND participant_id=$2 AND kind='final' ORDER BY created_at LIMIT 1",
        [input.challengeId, input.participantId]);
      if (locked && locked.prompt_hash !== hash)
        throw new AttemptAdmissionError('Final instructions are locked. Retry only the original instructions.');
    }
    const [override] = await tx.sql<{ extra_public_attempts: number }>(
      "SELECT extra_public_attempts FROM participant_attempt_overrides WHERE participant_code=$1 AND challenge_id=$2",
      [participant.participant_code,input.challengeId],
    );
    const [counts] = await tx.sql<{ used: number; next: number }>(
      `SELECT count(*)::integer AS used, COALESCE(max(attempt_number),0)::integer+1 AS next FROM (SELECT attempt_number FROM submissions WHERE challenge_id=$1 AND participant_id=$2 AND submission_type=$3 UNION ALL SELECT attempt_number FROM attempt_reservations WHERE challenge_id=$1 AND participant_id=$2 AND kind=$3 AND status='pending') attempts`,
      [input.challengeId, input.participantId, input.kind],
    );
    const limit =
      input.kind === "public"
        ? challenge.public_submission_limit +
          (education ? 0 : override?.extra_public_attempts || 0)
        : education ? 1 : challenge.final_submission_limit;
    if (counts.used >= limit)
      throw new AttemptAdmissionError("Submission limit reached.");
    const [reservation] = await tx.sql<Reservation>(
      `INSERT INTO attempt_reservations(challenge_id,participant_id,kind,idempotency_key,prompt_hash,attempt_number,prompt_text) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(challenge_id,participant_id,kind,idempotency_key) DO UPDATE SET id=gen_random_uuid(),status='pending',attempt_number=EXCLUDED.attempt_number,created_at=now(),completed_at=NULL,prompt_text=COALESCE(attempt_reservations.prompt_text,EXCLUDED.prompt_text) RETURNING *`,
      [
        input.challengeId,
        input.participantId,
        input.kind,
        key,
        hash,
        counts.next,
        input.prompt,
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

/** Explicit organizer recovery only after the worker is confirmed stopped.
 * A failed retry gets a new UUID, fencing any late completion from the old worker.
 */
export async function recoverAbandonedReservation(db: Database, id: string, workerStopped: boolean) {
  if (!workerStopped) throw new AttemptAdmissionError('Confirm the original worker has stopped before recovery.');
  const rows = await db.sql<{id:string}>(
    "UPDATE attempt_reservations SET status='failed',completed_at=now() WHERE id=$1 AND status='pending' AND created_at < now() - interval '30 minutes' RETURNING id", [id]);
  return rows.length === 1;
}
