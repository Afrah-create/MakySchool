-- Migration 041: A-Level term locks (open/closed exams) and report metadata.
-- A class-term is "open" when no lock row exists; locked = closed for entry.

CREATE TABLE IF NOT EXISTS alevel_term_locks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  locked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (school_id, class_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_term_locks_lookup
  ON alevel_term_locks (school_id, class_id, term_id);

-- Report card comments + head-teacher approval (per student per term).
CREATE TABLE IF NOT EXISTS alevel_report_metadata (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id                 UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id        UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id                UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  class_teacher_comment   TEXT,
  head_teacher_comment    TEXT,
  approved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at             TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_report_metadata_class_term
  ON alevel_report_metadata (school_id, class_id, term_id);
