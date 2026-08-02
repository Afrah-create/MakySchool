-- Allow multiple assessment sessions per class/term (e.g. several CAs).
-- Persist which sessions feed end-of-term grading, and store CA/exam breakdown on results.

ALTER TABLE olevel_exam_sessions
  DROP CONSTRAINT IF EXISTS olevel_exam_sessions_school_id_class_id_term_id_category_id_academic_year_id_key;

CREATE TABLE IF NOT EXISTS olevel_term_grading_selections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id                UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id                 UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id        UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  exam_session_id         UUID NOT NULL REFERENCES olevel_exam_sessions(id) ON DELETE RESTRICT,
  assessment_session_ids  UUID[] NOT NULL DEFAULT '{}'::uuid[],
  selected_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  selected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, term_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_term_grading_selections_lookup
  ON olevel_term_grading_selections (school_id, class_id, term_id, academic_year_id);

ALTER TABLE olevel_subject_results
  ADD COLUMN IF NOT EXISTS assessment_percent NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS exam_percent NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS grade_label TEXT;
