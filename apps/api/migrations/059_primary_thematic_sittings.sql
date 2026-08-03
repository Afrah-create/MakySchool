-- Lower primary thematic sittings + admin strands catalogue.
-- Assessment uniqueness becomes sitting-scoped; term results can key off sittings.

-- ── Sittings (BOT/MID/EOT lifecycle for P1–P3) ────────────────────────────────
CREATE TABLE IF NOT EXISTS primary_thematic_sittings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  exam_type_id      UUID REFERENCES primary_exam_types(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'open', 'closed')),
  notes             TEXT,
  opened_at         TIMESTAMPTZ,
  opened_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_thematic_sittings_active
  ON primary_thematic_sittings (school_id, class_id, term_id, exam_type_id)
  WHERE deleted_at IS NULL AND exam_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_primary_thematic_sittings_class_term
  ON primary_thematic_sittings (school_id, class_id, term_id)
  WHERE deleted_at IS NULL;

-- ── School-managed strands (admin CRUD; seed defaults per school on first use) ─
CREATE TABLE IF NOT EXISTS primary_strands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_primary_strands_school
  ON primary_strands (school_id, display_order);

-- ── Assessments belong to a sitting ───────────────────────────────────────────
ALTER TABLE primary_thematic_assessments
  ADD COLUMN IF NOT EXISTS sitting_id UUID REFERENCES primary_thematic_sittings(id) ON DELETE CASCADE;

ALTER TABLE primary_thematic_assessments
  DROP CONSTRAINT IF EXISTS primary_thematic_assessments_student_id_theme_id_strand_term_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_thematic_assessments_sitting
  ON primary_thematic_assessments (student_id, theme_id, strand, sitting_id)
  WHERE sitting_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_thematic_assessments_legacy_term
  ON primary_thematic_assessments (student_id, theme_id, strand, term_id)
  WHERE sitting_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_primary_thematic_assessments_sitting
  ON primary_thematic_assessments (school_id, sitting_id)
  WHERE sitting_id IS NOT NULL;

-- ── Term results can be keyed by sitting (lower) or exam (upper) ──────────────
ALTER TABLE primary_term_results
  ADD COLUMN IF NOT EXISTS sitting_id UUID REFERENCES primary_thematic_sittings(id) ON DELETE CASCADE;

-- Allow exam_id to be null for thematic sittings
ALTER TABLE primary_term_results
  ALTER COLUMN exam_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primary_term_results_sitting_student'
  ) THEN
    ALTER TABLE primary_term_results
      ADD CONSTRAINT primary_term_results_sitting_student
      UNIQUE (sitting_id, student_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_primary_term_results_sitting
  ON primary_term_results (school_id, sitting_id)
  WHERE sitting_id IS NOT NULL;
