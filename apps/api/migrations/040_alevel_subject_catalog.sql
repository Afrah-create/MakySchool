-- Migration 040: A-Level subjects become an extension of the school subject
-- catalogue (school_subjects) instead of a parallel catalogue.
--
-- Subject identity (name) lives in school_subjects and is managed from the
-- Academics > Subjects page. alevel_subjects keeps only UACE-specific data:
-- code, principal/subsidiary type, GP flag, active flag.

-- 1. Link column. NO ACTION (not CASCADE) so deleting a catalogue subject that
--    has an A-Level profile is rejected instead of silently dropping grades.
ALTER TABLE alevel_subjects
  ADD COLUMN IF NOT EXISTS school_subject_id UUID REFERENCES school_subjects(id);

-- 2. Create catalogue rows for existing A-Level subjects with no name match.
INSERT INTO school_subjects (id, school_id, name)
SELECT gen_random_uuid(), t.school_id, t.name
FROM (
  SELECT DISTINCT ON (a.school_id, LOWER(a.name)) a.school_id, a.name
  FROM alevel_subjects a
  WHERE a.school_subject_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM school_subjects s
      WHERE s.school_id = a.school_id AND LOWER(s.name) = LOWER(a.name)
    )
) t;

-- 3. Backfill links by case-insensitive name match.
UPDATE alevel_subjects a
SET school_subject_id = s.id
FROM school_subjects s
WHERE a.school_subject_id IS NULL
  AND s.school_id = a.school_id
  AND LOWER(s.name) = LOWER(a.name);

-- 4. Collapse duplicate profiles pointing at the same catalogue subject
--    (keep the oldest; dependent combination links/grades cascade).
DELETE FROM alevel_subjects
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY school_id, school_subject_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM alevel_subjects
    WHERE school_subject_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 5. Enforce the link: exactly one A-Level profile per catalogue subject.
ALTER TABLE alevel_subjects ALTER COLUMN school_subject_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alevel_subjects_school_subject_unique
  ON alevel_subjects (school_id, school_subject_id);

-- 6. Name now lives solely in school_subjects.
ALTER TABLE alevel_subjects DROP COLUMN IF EXISTS name;
