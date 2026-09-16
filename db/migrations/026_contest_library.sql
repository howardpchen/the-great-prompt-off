-- Refuse pre-existing inconsistent state rather than silently choosing a winner.
CREATE UNIQUE INDEX challenges_one_active ON challenges ((true)) WHERE is_active;
