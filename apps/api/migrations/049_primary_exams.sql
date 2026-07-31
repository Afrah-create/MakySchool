-- Primary exam workflow (A-Level-aligned) + school_subjects bridge.
-- Idempotent. Run after 048_primary_reports.sql.

-- ── Bridge primary subjects → school catalogue (teaching load) ───────────────
ALTER TABLE primary_subjects
  ADD COLUMN IF NOT EXISTS school_subject_id UUID
    REFERENCES school_subjects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS primary_subjects_school_subject_unique
  ON primary_subjects (school_id, school_subject_id)
  WHERE school_subject_id IS NOT NULL;

-- ── Exam types (admin-managed catalogue) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_exam_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS primary_exam_types_name_unique
  ON primary_exam_types (school_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_primary_exam_types_school
  ON primary_exam_types (school_id, is_active, sort_order);

-- ── Exam instances (class × term × type) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_exams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  exam_type_id      UUID NOT NULL REFERENCES primary_exam_types(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'open', 'closed')),
  opened_at         TIMESTAMPTZ,
  opened_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, term_id, exam_type_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_exams_class_term
  ON primary_exams (school_id, class_id, term_id, status);

-- ── Per-teacher mark submissions (lock) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_mark_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id      UUID NOT NULL REFERENCES primary_exams(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlocked_at  TIMESTAMPTZ,
  unlocked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, exam_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_mark_submissions_exam
  ON primary_mark_submissions (school_id, exam_id);

-- Attach exam marks to exam instances
ALTER TABLE primary_exam_marks
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES primary_exams(id) ON DELETE CASCADE;

ALTER TABLE primary_exam_marks
  ALTER COLUMN exam_type DROP NOT NULL;

-- Prefer exam_id uniqueness for new exam-based marks (NULLs allowed for legacy rows).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primary_exam_marks_exam_student_subject'
  ) THEN
    ALTER TABLE primary_exam_marks
      ADD CONSTRAINT primary_exam_marks_exam_student_subject
      UNIQUE (exam_id, student_id, subject_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_primary_exam_marks_exam
  ON primary_exam_marks (school_id, exam_id)
  WHERE exam_id IS NOT NULL;

-- ── Results keyed by exam (each exam graded separately — no cross-exam average)
ALTER TABLE primary_subject_results
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES primary_exams(id) ON DELETE CASCADE;

ALTER TABLE primary_subject_results
  DROP CONSTRAINT IF EXISTS primary_subject_results_student_id_subject_id_term_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primary_subject_results_exam_student_subject'
  ) THEN
    ALTER TABLE primary_subject_results
      ADD CONSTRAINT primary_subject_results_exam_student_subject
      UNIQUE (exam_id, student_id, subject_id);
  END IF;
END $$;

ALTER TABLE primary_term_results
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES primary_exams(id) ON DELETE CASCADE;

ALTER TABLE primary_term_results
  DROP CONSTRAINT IF EXISTS primary_term_results_student_id_term_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primary_term_results_exam_student'
  ) THEN
    ALTER TABLE primary_term_results
      ADD CONSTRAINT primary_term_results_exam_student
      UNIQUE (exam_id, student_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_primary_term_results_exam
  ON primary_term_results (school_id, exam_id)
  WHERE exam_id IS NOT NULL;
