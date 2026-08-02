-- Soft delete for O-Level exam sessions (idempotent).
-- Soft-deleted sessions keep marks for audit; hard delete only when empty.

ALTER TABLE olevel_exam_sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_olevel_exam_sessions_school_active
  ON olevel_exam_sessions (school_id, academic_year_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_olevel_exam_sessions_deleted
  ON olevel_exam_sessions (school_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
