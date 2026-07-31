-- Primary exam subject scope + PLE-style aggregates.
-- Exams only include selected subjects (default: is_ple_subject cores).
-- Aggregate mode: ple_points (D1–F9 → sum 4–36) or percent (legacy average).

ALTER TABLE primary_grading_systems
  ADD COLUMN IF NOT EXISTS aggregate_mode TEXT NOT NULL DEFAULT 'ple_points'
    CHECK (aggregate_mode IN ('ple_points', 'percent'));

COMMENT ON COLUMN primary_grading_systems.aggregate_mode IS
  'ple_points = UNEB-style D1–F9 points summed over aggregate subjects; percent = average %.';

CREATE TABLE IF NOT EXISTS primary_exam_subjects (
  exam_id     UUID NOT NULL REFERENCES primary_exams(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_primary_exam_subjects_school
  ON primary_exam_subjects (school_id, exam_id);

ALTER TABLE primary_subject_results
  ADD COLUMN IF NOT EXISTS grade_points INT;

ALTER TABLE primary_term_results
  ADD COLUMN IF NOT EXISTS aggregate INT;

ALTER TABLE primary_term_results
  ADD COLUMN IF NOT EXISTS division TEXT;

-- Backfill exam subjects for existing exams: PLE aggregate subjects for that class level.
INSERT INTO primary_exam_subjects (exam_id, subject_id, school_id)
SELECT e.id, ps.id, e.school_id
FROM primary_exams e
JOIN school_classes sc ON sc.id = e.class_id
JOIN primary_subjects ps
  ON ps.school_id = e.school_id
 AND ps.is_active = true
 AND ps.is_ple_subject = true
 AND ps.subject_type IN ('core', 'elective')
WHERE NOT EXISTS (
  SELECT 1 FROM primary_exam_subjects x WHERE x.exam_id = e.id
)
AND (
  ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], ps.applies_from)
  <= ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], sc.level)
)
AND (
  ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], sc.level)
  <= ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], ps.applies_to)
)
ON CONFLICT DO NOTHING;

-- If an exam still has no subjects (no PLE flags), attach all level cores.
INSERT INTO primary_exam_subjects (exam_id, subject_id, school_id)
SELECT e.id, ps.id, e.school_id
FROM primary_exams e
JOIN school_classes sc ON sc.id = e.class_id
JOIN primary_subjects ps
  ON ps.school_id = e.school_id
 AND ps.is_active = true
 AND ps.subject_type IN ('core', 'elective')
WHERE NOT EXISTS (
  SELECT 1 FROM primary_exam_subjects x WHERE x.exam_id = e.id
)
AND (
  ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], ps.applies_from)
  <= ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], sc.level)
)
AND (
  ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], sc.level)
  <= ARRAY_POSITION(ARRAY['P1','P2','P3','P4','P5','P6','P7']::text[], ps.applies_to)
)
ON CONFLICT DO NOTHING;
