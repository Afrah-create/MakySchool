-- Migration 038: enforce one teacher per class-subject slot.
-- Duplicate assignments (two teachers on the same class+subject) caused the
-- teaching-load matrix to return duplicate slots.

-- Remove duplicates, keeping the most recently assigned teacher per slot.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY school_id, class_id, subject_id
           ORDER BY assigned_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM teacher_class_assignments
  WHERE subject_id IS NOT NULL
)
DELETE FROM teacher_class_assignments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- One teacher per subject slot (class-teacher rows with NULL subject are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_assignments_slot_unique
  ON teacher_class_assignments (school_id, class_id, subject_id)
  WHERE subject_id IS NOT NULL;
