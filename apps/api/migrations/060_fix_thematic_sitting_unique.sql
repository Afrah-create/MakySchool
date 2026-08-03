-- Fix leftover unique constraint from 048 that 059 failed to drop
-- (Postgres truncated the constraint name, so DROP ..._term_id_key was a no-op).
-- That legacy UNIQUE (student_id, theme_id, strand, term_id) blocked sitting-scoped upserts.

ALTER TABLE primary_thematic_assessments
  DROP CONSTRAINT IF EXISTS primary_thematic_assessments_student_id_theme_id_strand_term_id_key;

ALTER TABLE primary_thematic_assessments
  DROP CONSTRAINT IF EXISTS primary_thematic_assessments_student_id_theme_id_strand_ter_key;

-- Sitting-scoped uniqueness (re-assert if missing)
CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_thematic_assessments_sitting
  ON primary_thematic_assessments (student_id, theme_id, strand, sitting_id)
  WHERE sitting_id IS NOT NULL;

-- Legacy rows without a sitting keep term uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_thematic_assessments_legacy_term
  ON primary_thematic_assessments (student_id, theme_id, strand, term_id)
  WHERE sitting_id IS NULL;
