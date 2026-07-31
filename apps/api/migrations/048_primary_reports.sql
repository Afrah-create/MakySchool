-- Primary school reports (P1–P7). Internal term assessment + PLE bookkeeping.
-- Idempotent. Tenant isolation via school_id at the API layer.

-- ── Grading system ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_grading_systems (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL DEFAULT 'Standard Uganda Primary',
  ca_weight             NUMERIC(5,2) NOT NULL DEFAULT 30.00
                          CHECK (ca_weight >= 0 AND ca_weight <= 100),
  exam_weight           NUMERIC(5,2) NOT NULL DEFAULT 70.00
                          CHECK (exam_weight >= 0 AND exam_weight <= 100),
  allow_thematic_in_p4  BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id),
  CHECK (ca_weight + exam_weight = 100)
);

-- ── Grade scale ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_grade_scales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade_system_id UUID NOT NULL REFERENCES primary_grading_systems(id) ON DELETE CASCADE,
  grade           TEXT NOT NULL,
  label           TEXT NOT NULL,
  min_percent     NUMERIC(5,2) NOT NULL CHECK (min_percent >= 0 AND min_percent <= 100),
  max_percent     NUMERIC(5,2) NOT NULL CHECK (max_percent >= 0 AND max_percent <= 100),
  remarks         TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  UNIQUE (school_id, grade),
  CHECK (min_percent <= max_percent)
);

CREATE INDEX IF NOT EXISTS idx_primary_grade_scales_system
  ON primary_grade_scales (grade_system_id, display_order);

-- ── Themes (configurable; NCDC-style defaults seeded at setup) ───────────────
CREATE TABLE IF NOT EXISTS primary_themes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  applies_from  TEXT NOT NULL DEFAULT 'P1'
                  CHECK (applies_from IN ('P1','P2','P3','P4')),
  applies_to    TEXT NOT NULL DEFAULT 'P3'
                  CHECK (applies_to IN ('P1','P2','P3','P4')),
  display_order INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id, name)
);

-- ── Subjects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_subjects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL,
  subject_type   TEXT NOT NULL
                   CHECK (subject_type IN ('core', 'elective', 'thematic')),
  applies_from   TEXT NOT NULL DEFAULT 'P1'
                   CHECK (applies_from IN ('P1','P2','P3','P4','P5','P6','P7')),
  applies_to     TEXT NOT NULL DEFAULT 'P7'
                   CHECK (applies_to IN ('P1','P2','P3','P4','P5','P6','P7')),
  religion_type  TEXT CHECK (religion_type IS NULL OR religion_type IN ('CRE','IRE')),
  max_mark       NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (max_mark > 0),
  is_ple_subject BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_primary_subjects_school
  ON primary_subjects (school_id, is_active, display_order);

-- ── Class–subject links ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_class_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  max_mark   NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (max_mark > 0),
  UNIQUE (class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_class_subjects_class
  ON primary_class_subjects (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_primary_class_subjects_teacher
  ON primary_class_subjects (school_id, teacher_id)
  WHERE teacher_id IS NOT NULL;

-- ── Thematic assessments (P1–P3, optional P4) ────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_thematic_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  theme_id        UUID NOT NULL REFERENCES primary_themes(id) ON DELETE CASCADE,
  strand          TEXT NOT NULL,
  level           INT  NOT NULL CHECK (level IN (1,2,3,4)),
  term_id         UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  teacher_comment TEXT,
  recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted       BOOLEAN NOT NULL DEFAULT false,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, theme_id, strand, term_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_thematic_class_term
  ON primary_thematic_assessments (school_id, class_id, term_id);

-- ── Continuous assessment marks (P4–P7) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_ca_marks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
  ca_title         TEXT NOT NULL,
  ca_type          TEXT NOT NULL
                     CHECK (ca_type IN ('assignment','test','project','quiz','practical')),
  max_score        NUMERIC(5,2) NOT NULL CHECK (max_score > 0),
  score            NUMERIC(5,2),
  term_id          UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  recorded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (score IS NULL OR (score >= 0 AND score <= max_score))
);

CREATE INDEX IF NOT EXISTS idx_primary_ca_class_subject_term
  ON primary_ca_marks (school_id, class_id, subject_id, term_id);
CREATE INDEX IF NOT EXISTS idx_primary_ca_student_term
  ON primary_ca_marks (school_id, student_id, term_id);

-- Unique CA column identity for bulk upsert (same title+type per student/subject/term)
CREATE UNIQUE INDEX IF NOT EXISTS primary_ca_marks_unique_entry
  ON primary_ca_marks (student_id, subject_id, term_id, ca_title, ca_type);

-- ── Exam marks (P4–P7) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_exam_marks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
  exam_type        TEXT NOT NULL
                     CHECK (exam_type IN ('mid_term','end_of_term','mock','internal','ple_mock')),
  max_score        NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  score            NUMERIC(5,2),
  term_id          UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  recorded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted        BOOLEAN NOT NULL DEFAULT false,
  submitted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id, exam_type, term_id),
  CHECK (score IS NULL OR (score >= 0 AND score <= max_score))
);

CREATE INDEX IF NOT EXISTS idx_primary_exam_class_subject_term
  ON primary_exam_marks (school_id, class_id, subject_id, term_id);

-- ── Computed subject results ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_subject_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
  term_id          UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  ca_total         NUMERIC(7,2),
  ca_max           NUMERIC(7,2),
  ca_percentage    NUMERIC(5,2),
  exam_score       NUMERIC(5,2),
  exam_percentage  NUMERIC(5,2),
  final_percent    NUMERIC(5,2),
  grade            TEXT,
  grade_label      TEXT,
  position         INT,
  teacher_comment  TEXT,
  calculated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_subj_results_class_term
  ON primary_subject_results (school_id, class_id, term_id);

-- ── Term aggregates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_term_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id              UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id               UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id      UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  total_marks           NUMERIC(9,2),
  total_possible        NUMERIC(9,2),
  average_percent       NUMERIC(5,2),
  overall_grade         TEXT,
  overall_grade_label   TEXT,
  class_position        INT,
  total_students        INT,
  class_teacher_comment TEXT,
  head_teacher_comment  TEXT,
  attendance_days       INT,
  present_days          INT,
  report_generated      BOOLEAN NOT NULL DEFAULT false,
  report_generated_at   TIMESTAMPTZ,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_term_results_class_term
  ON primary_term_results (school_id, class_id, term_id);

-- ── PLE results (P7 national) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ple_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  english_grade    TEXT,
  english_points   INT,
  math_grade       TEXT,
  math_points      INT,
  science_grade    TEXT,
  science_points   INT,
  sst_grade        TEXT,
  sst_points       INT,
  aggregate        INT,
  division         TEXT CHECK (division IS NULL OR division IN ('1','2','3','4','U')),
  index_number     TEXT,
  entered_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_ple_school_year
  ON ple_results (school_id, academic_year_id);
