-- Phase 1: Add academic_year_id scoping to operational tables.
-- Additive + backfill. Historical rows are preserved.

-- ---------------------------------------------------------------------------
-- Ensure every school that needs a year has at least one (for backfill)
-- ---------------------------------------------------------------------------
INSERT INTO academic_years (id, school_id, year, is_current, status)
SELECT
  gen_random_uuid(),
  s.id,
  EXTRACT(YEAR FROM NOW())::INT,
  true,
  'active'
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM academic_years ay WHERE ay.school_id = s.id
)
AND (
  EXISTS (SELECT 1 FROM teacher_class_assignments t WHERE t.school_id = s.id)
  OR EXISTS (SELECT 1 FROM timetable_periods tp WHERE tp.school_id = s.id)
  OR EXISTS (SELECT 1 FROM fee_structures fs WHERE fs.school_id = s.id)
  OR EXISTS (SELECT 1 FROM student_class_history h WHERE h.school_id = s.id)
);

-- ---------------------------------------------------------------------------
-- teacher_class_assignments
-- ---------------------------------------------------------------------------
ALTER TABLE teacher_class_assignments
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

UPDATE teacher_class_assignments tca
SET academic_year_id = sub.year_id
FROM (
  SELECT DISTINCT ON (ay.school_id)
    ay.school_id,
    ay.id AS year_id
  FROM academic_years ay
  ORDER BY ay.school_id, ay.is_current DESC, ay.year DESC, ay.created_at DESC
) sub
WHERE tca.school_id = sub.school_id
  AND tca.academic_year_id IS NULL;

ALTER TABLE teacher_class_assignments
  DROP CONSTRAINT IF EXISTS teacher_class_assignments_school_id_teacher_id_class_id_subject_id_key;

DROP INDEX IF EXISTS teacher_class_assignments_slot_unique;

-- Drop duplicate slots within the same year before unique indexes
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, teacher_id, class_id, subject_id, academic_year_id
      ORDER BY assigned_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM teacher_class_assignments
  WHERE academic_year_id IS NOT NULL
)
DELETE FROM teacher_class_assignments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked_slots AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, class_id, subject_id, academic_year_id
      ORDER BY assigned_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM teacher_class_assignments
  WHERE subject_id IS NOT NULL
    AND academic_year_id IS NOT NULL
)
DELETE FROM teacher_class_assignments
WHERE id IN (SELECT id FROM ranked_slots WHERE rn > 1);

-- Require year when present; leave rare orphans nullable only if backfill failed
ALTER TABLE teacher_class_assignments
  ALTER COLUMN academic_year_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_assignments_year_unique
  ON teacher_class_assignments (school_id, teacher_id, class_id, subject_id, academic_year_id);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_assignments_slot_year_unique
  ON teacher_class_assignments (school_id, class_id, subject_id, academic_year_id)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tca_school_year
  ON teacher_class_assignments (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- student_class_history
-- ---------------------------------------------------------------------------
ALTER TABLE student_class_history
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

UPDATE student_class_history h
SET academic_year_id = sub.year_id
FROM (
  SELECT DISTINCT ON (ay.school_id)
    ay.school_id,
    ay.id AS year_id
  FROM academic_years ay
  ORDER BY ay.school_id, ay.is_current DESC, ay.year DESC, ay.created_at DESC
) sub
WHERE h.school_id = sub.school_id
  AND h.academic_year_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sch_school_year
  ON student_class_history (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- timetable_periods
-- ---------------------------------------------------------------------------
ALTER TABLE timetable_periods
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

-- Prefer year from term, else school current/latest year
UPDATE timetable_periods tp
SET academic_year_id = t.academic_year_id
FROM terms t
WHERE tp.term_id = t.id
  AND tp.academic_year_id IS NULL;

UPDATE timetable_periods tp
SET academic_year_id = sub.year_id
FROM (
  SELECT DISTINCT ON (ay.school_id)
    ay.school_id,
    ay.id AS year_id
  FROM academic_years ay
  ORDER BY ay.school_id, ay.is_current DESC, ay.year DESC, ay.created_at DESC
) sub
WHERE tp.school_id = sub.school_id
  AND tp.academic_year_id IS NULL;

ALTER TABLE timetable_periods
  DROP CONSTRAINT IF EXISTS timetable_periods_school_id_class_id_day_of_week_period_number_key;

-- Collapse duplicates within a year before unique index
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, class_id, academic_year_id, day_of_week, period_number
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM timetable_periods
  WHERE academic_year_id IS NOT NULL
)
DELETE FROM timetable_periods
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE timetable_periods
  ALTER COLUMN academic_year_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS timetable_periods_year_slot_unique
  ON timetable_periods (school_id, class_id, academic_year_id, day_of_week, period_number);

CREATE INDEX IF NOT EXISTS idx_timetable_school_year
  ON timetable_periods (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- fee_structures: add UUID FK; keep integer academic_year for compatibility
-- ---------------------------------------------------------------------------
ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

UPDATE fee_structures fs
SET academic_year_id = ay.id
FROM academic_years ay
WHERE ay.school_id = fs.school_id
  AND ay.year = fs.academic_year
  AND fs.academic_year_id IS NULL;

UPDATE fee_structures fs
SET academic_year_id = sub.year_id
FROM (
  SELECT DISTINCT ON (ay.school_id)
    ay.school_id,
    ay.id AS year_id
  FROM academic_years ay
  ORDER BY ay.school_id, ay.is_current DESC, ay.year DESC, ay.created_at DESC
) sub
WHERE fs.school_id = sub.school_id
  AND fs.academic_year_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fee_structures_academic_year_id
  ON fee_structures (school_id, academic_year_id)
  WHERE deleted_at IS NULL;
