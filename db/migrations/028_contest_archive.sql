ALTER TABLE challenges ADD COLUMN archived_at timestamptz;
COMMENT ON COLUMN challenges.archived_at IS 'Organizer archive marker; never deletes reports or history.';
