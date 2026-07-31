-- Soft delete for primary exams (idempotent)
-- Soft-deleted exams keep marks for audit; hard delete only when empty.

ALTER TABLE primary_exams
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Replace table UNIQUE with a partial unique index so a soft-deleted
-- exam does not block creating a replacement for the same class/term/type.
ALTER TABLE primary_exams
  DROP CONSTRAINT IF EXISTS primary_exams_school_id_class_id_term_id_exam_type_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS primary_exams_active_unique
  ON primary_exams (school_id, class_id, term_id, exam_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_primary_exams_school_active
  ON primary_exams (school_id)
  WHERE deleted_at IS NULL;
