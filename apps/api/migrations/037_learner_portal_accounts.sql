-- Link enrolled students to portal login accounts (shared by learners & parents).
-- Accounts are provisioned on student create / admin reset (not in this migration).

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id)
  WHERE user_id IS NOT NULL;
