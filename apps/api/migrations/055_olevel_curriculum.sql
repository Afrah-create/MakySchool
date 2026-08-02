
-- ── Curricula ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curricula (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  education_level     TEXT NOT NULL DEFAULT 'lower_secondary'
                        CHECK (education_level IN ('lower_secondary', 'upper_secondary', 'primary', 'other')),
  academic_year_from  INT NOT NULL,
  academic_year_to    INT,
  version             TEXT NOT NULL DEFAULT '1.0',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_curricula_school ON curricula (school_id, is_active);

-- ── Grade scale ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_grade_scales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  grade           TEXT NOT NULL,
  label           TEXT NOT NULL,
  points          NUMERIC(5, 2) NOT NULL,
  min_percent     NUMERIC(5, 2) NOT NULL,
  max_percent     NUMERIC(5, 2) NOT NULL,
  is_pass         BOOLEAN NOT NULL DEFAULT true,
  display_order   INT NOT NULL DEFAULT 0,
  UNIQUE (curriculum_id, grade)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_grade_scales_curriculum
  ON curriculum_grade_scales (curriculum_id, display_order);

-- ── Assessment categories (CA / EXAM weights) ────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_assessment_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  weight_percent  NUMERIC(5, 2) NOT NULL,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (curriculum_id, code)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_assessment_categories_curriculum
  ON curriculum_assessment_categories (curriculum_id, display_order);

-- ── Selection rules (S1–S2 vs S3–S4) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_selection_rules (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id               UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  applies_to_levels           TEXT[] NOT NULL,
  -- Stable uniqueness key (e.g. 'S1,S2'). Avoids expression indexes on
  -- array_to_string(), which PostgreSQL rejects as non-IMMUTABLE (42P17).
  levels_key                  TEXT NOT NULL,
  min_subjects                INT NOT NULL,
  max_subjects                INT NOT NULL,
  compulsory_count            INT NOT NULL,
  optional_min                INT NOT NULL,
  optional_max                INT NOT NULL,
  optional_to_count_in_result INT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_id, levels_key)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_selection_rules_curriculum
  ON curriculum_selection_rules (curriculum_id);

-- ── Promotion rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_promotion_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id           UUID NOT NULL UNIQUE REFERENCES curricula(id) ON DELETE CASCADE,
  min_grade_to_pass       TEXT NOT NULL DEFAULT 'D',
  max_failed_compulsory   INT NOT NULL DEFAULT 0,
  max_failed_optional     INT NOT NULL DEFAULT 2,
  attendance_min_percent  NUMERIC(5, 2)
);

-- ── Report card display rules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_report_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id             UUID NOT NULL UNIQUE REFERENCES curricula(id) ON DELETE CASCADE,
  show_grades               BOOLEAN NOT NULL DEFAULT true,
  show_percentages          BOOLEAN NOT NULL DEFAULT true,
  show_points               BOOLEAN NOT NULL DEFAULT true,
  show_remarks              BOOLEAN NOT NULL DEFAULT true,
  show_class_position       BOOLEAN NOT NULL DEFAULT true,
  show_subject_position     BOOLEAN NOT NULL DEFAULT true,
  show_division_ranking     BOOLEAN NOT NULL DEFAULT false,
  show_result_code          BOOLEAN NOT NULL DEFAULT false,
  show_teacher_comment      BOOLEAN NOT NULL DEFAULT true,
  show_head_teacher_comment BOOLEAN NOT NULL DEFAULT true,
  show_attendance           BOOLEAN NOT NULL DEFAULT true,
  report_title              TEXT NOT NULL DEFAULT 'PROGRESS REPORT',
  custom_footer_text        TEXT
);

-- ── O-Level subject catalogue (bridged to school_subjects) ───────────────────
CREATE TABLE IF NOT EXISTS olevel_subjects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_subject_id   UUID REFERENCES school_subjects(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  code                TEXT NOT NULL,
  abbreviation        TEXT,
  department          TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_olevel_subjects_school ON olevel_subjects (school_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_olevel_subjects_school_subject
  ON olevel_subjects (school_id, school_subject_id)
  WHERE school_subject_id IS NOT NULL;

-- ── Curriculum ↔ subjects (role may differ by level band) ────────────────────
CREATE TABLE IF NOT EXISTS curriculum_subjects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id     UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES olevel_subjects(id) ON DELETE CASCADE,
  subject_role      TEXT NOT NULL CHECK (subject_role IN ('compulsory', 'optional', 'co_curricular')),
  applies_to_levels TEXT[] NOT NULL,
  display_order     INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (curriculum_id, subject_id, subject_role)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_subjects_curriculum
  ON curriculum_subjects (curriculum_id, is_active);

-- ── Exam sessions (mark-entry gate) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS olevel_exam_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  curriculum_id     UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  category_id       UUID NOT NULL REFERENCES curriculum_assessment_categories(id) ON DELETE RESTRICT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'open', 'closed')),
  max_marks         NUMERIC(6, 2) NOT NULL DEFAULT 100,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_at         TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, term_id, category_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_exam_sessions_school
  ON olevel_exam_sessions (school_id, academic_year_id, status);
CREATE INDEX IF NOT EXISTS idx_olevel_exam_sessions_class_term
  ON olevel_exam_sessions (school_id, class_id, term_id, academic_year_id);

-- ── Student curriculum enrollments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_curriculum_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  curriculum_id     UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  class_id          UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_student_curriculum_enrollments_class
  ON student_curriculum_enrollments (school_id, class_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_student_curriculum_enrollments_student
  ON student_curriculum_enrollments (school_id, student_id);

-- ── Subject registrations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_subject_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_id     UUID NOT NULL REFERENCES student_curriculum_enrollments(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES olevel_subjects(id) ON DELETE RESTRICT,
  subject_role      TEXT NOT NULL CHECK (subject_role IN ('compulsory', 'optional')),
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'dropped')),
  registered_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_student_subject_registrations_enrollment
  ON student_subject_registrations (enrollment_id, status);
CREATE INDEX IF NOT EXISTS idx_student_subject_registrations_subject
  ON student_subject_registrations (school_id, subject_id, academic_year_id);

-- ── Marks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS olevel_marks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_session_id   UUID NOT NULL REFERENCES olevel_exam_sessions(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES olevel_subjects(id) ON DELETE RESTRICT,
  enrollment_id     UUID NOT NULL REFERENCES student_curriculum_enrollments(id) ON DELETE CASCADE,
  raw_score         NUMERIC(6, 2),
  grade             TEXT,
  points            NUMERIC(5, 2),
  is_absent         BOOLEAN NOT NULL DEFAULT false,
  remarks           TEXT,
  entered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_session_id, student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_marks_session
  ON olevel_marks (school_id, exam_session_id);
CREATE INDEX IF NOT EXISTS idx_olevel_marks_student
  ON olevel_marks (school_id, student_id, subject_id);

-- ── Mark submissions (per teacher × subject × session) ───────────────────────
CREATE TABLE IF NOT EXISTS olevel_mark_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_session_id   UUID NOT NULL REFERENCES olevel_exam_sessions(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES olevel_subjects(id) ON DELETE CASCADE,
  teacher_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'unlocked')),
  submitted_at      TIMESTAMPTZ,
  unlocked_at       TIMESTAMPTZ,
  unlocked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  unlock_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_session_id, subject_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_mark_submissions_session
  ON olevel_mark_submissions (school_id, exam_session_id);

-- ── Per-subject term results ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS olevel_subject_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES student_curriculum_enrollments(id) ON DELETE CASCADE,
  subject_id          UUID NOT NULL REFERENCES olevel_subjects(id) ON DELETE RESTRICT,
  subject_role        TEXT NOT NULL,
  academic_year_id    UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_id             UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  category_scores     JSONB NOT NULL DEFAULT '{}'::jsonb,
  weighted_score      NUMERIC(6, 2),
  grade               TEXT,
  points              NUMERIC(5, 2),
  is_pass             BOOLEAN NOT NULL DEFAULT true,
  counts_in_result    BOOLEAN NOT NULL DEFAULT true,
  subject_position    INT,
  teacher_comment     TEXT,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, subject_id, academic_year_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_subject_results_class_term
  ON olevel_subject_results (school_id, academic_year_id, term_id);

-- ── Overall student term results ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS olevel_student_results (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_id           UUID NOT NULL REFERENCES student_curriculum_enrollments(id) ON DELETE CASCADE,
  academic_year_id        UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_id                 UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  compulsory_passed       INT NOT NULL DEFAULT 0,
  compulsory_failed       INT NOT NULL DEFAULT 0,
  optional_passed         INT NOT NULL DEFAULT 0,
  optional_failed         INT NOT NULL DEFAULT 0,
  subjects_counted        INT NOT NULL DEFAULT 0,
  total_points            NUMERIC(8, 2) NOT NULL DEFAULT 0,
  average_percent         NUMERIC(5, 2) NOT NULL DEFAULT 0,
  class_position          INT,
  total_students_in_class INT,
  is_promoted             BOOLEAN,
  promotion_reason        TEXT,
  class_teacher_comment   TEXT,
  head_teacher_comment    TEXT,
  approved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at             TIMESTAMPTZ,
  report_generated        BOOLEAN NOT NULL DEFAULT false,
  report_generated_at     TIMESTAMPTZ,
  calculated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, academic_year_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_olevel_student_results_class_term
  ON olevel_student_results (school_id, academic_year_id, term_id);
CREATE INDEX IF NOT EXISTS idx_olevel_student_results_enrollment
  ON olevel_student_results (enrollment_id, academic_year_id);
