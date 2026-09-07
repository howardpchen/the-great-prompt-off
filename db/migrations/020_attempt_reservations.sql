CREATE TABLE attempt_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
 participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
 kind submission_type NOT NULL,
 idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
 prompt_hash text NOT NULL,
 attempt_number integer NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','completed','failed')) DEFAULT 'pending',
 response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(challenge_id,participant_id,kind,idempotency_key)
);
CREATE INDEX attempt_reservations_pending ON attempt_reservations(challenge_id,participant_id,kind) WHERE status='pending';
