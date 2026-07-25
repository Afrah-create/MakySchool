-- Migration 039: Traditional UACE A-Level module.
-- Termly internal grading tool (subjects, combinations, enrollments, grades).
-- Fully idempotent. Tenant isolation via school_id filters at the API layer.

-- ── A-Level subject catalogue ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alevel_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('principal', 'subsidiary')),
  is_gp         BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_alevel_subjects_school ON alevel_subjects (school_id, is_active);

-- ── Combinations (e.g. PCM, HEL) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alevel_combinations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  label         TEXT,
  category      TEXT NOT NULL CHECK (category IN ('science', 'arts', 'business', 'technical')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_alevel_combinations_school ON alevel_combinations (school_id, is_active);

-- ── Combination → principal subjects (exactly 3, enforced in application logic) ─
CREATE TABLE IF NOT EXISTS alevel_combination_subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  combination_id  UUID NOT NULL REFERENCES alevel_combinations(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES alevel_subjects(id) ON DELETE CASCADE,
  UNIQUE (combination_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_combination_subjects_combo
  ON alevel_combination_subjects (combination_id);

-- ── Student enrollments (one per student per academic year) ───────────────────
CREATE TABLE IF NOT EXISTS alevel_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  combination_id        UUID NOT NULL REFERENCES alevel_combinations(id) ON DELETE RESTRICT,
  academic_year_id      UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  subsidiary_subject_id UUID REFERENCES alevel_subjects(id) ON DELETE SET NULL,
  class_id              UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_enrollments_class
  ON alevel_enrollments (school_id, class_id, academic_year_id);

-- ── Grades (one per student per subject per term) ─────────────────────────────
CREATE TABLE IF NOT EXISTS alevel_grades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES alevel_subjects(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id          UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  raw_score         NUMERIC(5, 2),
  grade             TEXT,
  points            SMALLINT,
  entered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, subject_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_grades_class_term
  ON alevel_grades (school_id, class_id, term_id);

CREATE INDEX IF NOT EXISTS idx_alevel_grades_student_year
  ON alevel_grades (school_id, student_id, academic_year_id);

-- ── Configurable grading scale ────────────────────────────────────────────────
-- Principal score bands per school. When a school has no rows, the API falls
-- back to the UNEB defaults baked into app.lib.alevel.
CREATE TABLE IF NOT EXISTS alevel_grade_bands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  min_score   NUMERIC(5, 2) NOT NULL,
  grade       TEXT NOT NULL,
  points      SMALLINT NOT NULL,
  UNIQUE (school_id, grade)
);

CREATE INDEX IF NOT EXISTS idx_alevel_grade_bands_school
  ON alevel_grade_bands (school_id, min_score DESC);

-- Per-school scalar config (currently just the subsidiary pass threshold).
CREATE TABLE IF NOT EXISTS alevel_config (
  school_id                 UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  subsidiary_pass_threshold NUMERIC(5, 2) NOT NULL DEFAULT 35.0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
