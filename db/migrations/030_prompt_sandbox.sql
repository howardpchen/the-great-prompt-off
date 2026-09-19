-- Sandbox is opt-in and does not write scored submissions, runs, or reference answers.
ALTER TABLE challenges ADD COLUMN sandbox_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE sandbox_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
 participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
 schema_version integer NOT NULL,
 idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
 input_hash text NOT NULL,
 prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 12000),
 reports jsonb NOT NULL CHECK (jsonb_array_length(reports)=3),
 results jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
 simulation boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',
 completed_at timestamptz,
 UNIQUE(participant_id,idempotency_key)
);
CREATE UNIQUE INDEX sandbox_one_inflight_per_participant ON sandbox_jobs(participant_id) WHERE status='running';
CREATE INDEX sandbox_cooldown ON sandbox_jobs(participant_id,completed_at DESC);
CREATE INDEX sandbox_active_jobs ON sandbox_jobs(expires_at) WHERE status='running';
