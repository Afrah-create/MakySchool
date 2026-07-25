-- Migration 042: A-Level exam types + multiple exams per term.
-- Grades and report metadata hang off exam_id (not only term_id).
-- Replaces alevel_term_locks with exam status (draft | open | closed).

-- ── 1. Exam types (school catalogue) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alevel_exam_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS alevel_exam_types_name_unique
  ON alevel_exam_types (school_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_alevel_exam_types_school
  ON alevel_exam_types (school_id, is_active, sort_order);

INSERT INTO alevel_exam_types (school_id, name, code, sort_order)
SELECT s.id, d.name, d.code, d.sort_order
FROM schools s
CROSS JOIN (VALUES
  ('Beginning of Term', 'BOT', 1),
  ('Mid Term', 'MID', 2),
  ('End of Term', 'EOT', 3)
) AS d(name, code, sort_order)
ON CONFLICT (school_id, code) DO NOTHING;

-- ── 2. Exams (one instance per class × term × type) ──────────────────────────
CREATE TABLE IF NOT EXISTS alevel_exams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id           UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  exam_type_id      UUID NOT NULL REFERENCES alevel_exam_types(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'open', 'closed')),
  opened_at         TIMESTAMPTZ,
  opened_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, term_id, exam_type_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_exams_class_term
  ON alevel_exams (school_id, class_id, term_id);

CREATE INDEX IF NOT EXISTS idx_alevel_exams_status
  ON alevel_exams (school_id, status);

-- ── 3. Backfill exams from existing grades ───────────────────────────────────
INSERT INTO alevel_exams (
  school_id, class_id, term_id, academic_year_id, exam_type_id, name, status,
  opened_at, created_at, updated_at
)
SELECT
  p.school_id,
  p.class_id,
  p.term_id,
  p.academic_year_id,
  tp.exam_type_id,
  tp.type_name,
  'open',
  NOW(),
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT school_id, class_id, term_id, academic_year_id
  FROM alevel_grades
  WHERE class_id IS NOT NULL
) p
JOIN LATERAL (
  SELECT id AS exam_type_id, name AS type_name
  FROM alevel_exam_types
  WHERE school_id = p.school_id
  ORDER BY CASE WHEN code = 'EOT' THEN 0 ELSE 1 END, sort_order, code
  LIMIT 1
) tp ON true
ON CONFLICT (school_id, class_id, term_id, exam_type_id) DO NOTHING;

-- Backfill from term locks when that table still exists
DO $$
BEGIN
  IF to_regclass('public.alevel_term_locks') IS NOT NULL THEN
    INSERT INTO alevel_exams (
      school_id, class_id, term_id, academic_year_id, exam_type_id, name, status,
      closed_at, closed_by, created_at, updated_at
    )
    SELECT
      l.school_id, l.class_id, l.term_id, l.academic_year_id,
      tp.exam_type_id, tp.type_name, 'closed',
      l.locked_at, l.locked_by, NOW(), NOW()
    FROM alevel_term_locks l
    JOIN LATERAL (
      SELECT id AS exam_type_id, name AS type_name
      FROM alevel_exam_types
      WHERE school_id = l.school_id
      ORDER BY CASE WHEN code = 'EOT' THEN 0 ELSE 1 END, sort_order, code
      LIMIT 1
    ) tp ON true
    ON CONFLICT (school_id, class_id, term_id, exam_type_id) DO NOTHING;

    UPDATE alevel_exams e
    SET status = 'closed',
        closed_at = COALESCE(e.closed_at, l.locked_at),
        closed_by = COALESCE(e.closed_by, l.locked_by),
        opened_at = CASE WHEN e.status = 'closed' THEN e.opened_at ELSE NULL END,
        updated_at = NOW()
    FROM alevel_term_locks l
    WHERE e.school_id = l.school_id
      AND e.class_id = l.class_id
      AND e.term_id = l.term_id;
  END IF;
END $$;

-- ── 4. Attach grades to exams ────────────────────────────────────────────────
ALTER TABLE alevel_grades
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES alevel_exams(id) ON DELETE CASCADE;

UPDATE alevel_grades g
SET exam_id = e.id
FROM alevel_exams e
WHERE g.exam_id IS NULL
  AND e.school_id = g.school_id
  AND e.class_id = g.class_id
  AND e.term_id = g.term_id;

DELETE FROM alevel_grades WHERE exam_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alevel_grades'
      AND column_name = 'exam_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE alevel_grades ALTER COLUMN exam_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE alevel_grades DROP CONSTRAINT IF EXISTS alevel_grades_school_id_student_id_subject_id_term_id_key;
DROP INDEX IF EXISTS alevel_grades_school_id_student_id_subject_id_term_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS alevel_grades_student_subject_exam_unique
  ON alevel_grades (school_id, student_id, subject_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_alevel_grades_exam
  ON alevel_grades (school_id, exam_id);

-- ── 5. Report metadata → per exam ────────────────────────────────────────────
ALTER TABLE alevel_report_metadata
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES alevel_exams(id) ON DELETE CASCADE;

UPDATE alevel_report_metadata m
SET exam_id = e.id
FROM alevel_exams e
WHERE m.exam_id IS NULL
  AND e.school_id = m.school_id
  AND e.term_id = m.term_id
  AND (m.class_id IS NULL OR e.class_id = m.class_id);

DELETE FROM alevel_report_metadata WHERE exam_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alevel_report_metadata'
      AND column_name = 'exam_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE alevel_report_metadata ALTER COLUMN exam_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE alevel_report_metadata
  DROP CONSTRAINT IF EXISTS alevel_report_metadata_school_id_student_id_term_id_key;
DROP INDEX IF EXISTS alevel_report_metadata_school_id_student_id_term_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS alevel_report_metadata_student_exam_unique
  ON alevel_report_metadata (school_id, student_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_alevel_report_metadata_exam
  ON alevel_report_metadata (school_id, exam_id);

-- ── 6. Drop legacy term locks (if present) ───────────────────────────────────
DROP TABLE IF EXISTS alevel_term_locks;
