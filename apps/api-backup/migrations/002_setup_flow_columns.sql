-- MakySchool setup flow columns (idempotent)
-- Extends schools/users for temp-password and setup wizard completion tracking.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;
ALTER TABLE schools ALTER COLUMN status SET DEFAULT 'setup';

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_temp_password BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false;

UPDATE users
SET is_temp_password = false
WHERE is_temp_password IS NULL AND password_hash IS NOT NULL;

UPDATE users
SET setup_completed = true
WHERE setup_completed IS NULL
  AND school_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM schools s
    WHERE s.id = users.school_id
      AND s.status = 'active'
      AND s.setup_completed_at IS NOT NULL
  );
