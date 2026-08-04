-- Phase 0: Academic year safety constraints.
-- Additive only. Does not delete historical terms or years.

-- ---------------------------------------------------------------------------
-- Status on academic years (draft | active | closed)
-- ---------------------------------------------------------------------------
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE academic_years
  DROP CONSTRAINT IF EXISTS academic_years_status_check;

ALTER TABLE academic_years
  ADD CONSTRAINT academic_years_status_check
  CHECK (status IN ('draft', 'active', 'closed'));

-- Align status with is_current for existing rows
UPDATE academic_years
SET status = CASE WHEN is_current THEN 'active' ELSE 'closed' END
WHERE status IS DISTINCT FROM CASE WHEN is_current THEN 'active' ELSE 'closed' END;

-- ---------------------------------------------------------------------------
-- Dedupe duplicate (school_id, year) before unique constraint
-- Keep the preferred row; re-point terms; remove extras.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    school_id,
    year,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, year
      ORDER BY is_current DESC, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM academic_years
),
dupes AS (
  SELECT r.id AS dupe_id, k.id AS keep_id
  FROM ranked r
  JOIN ranked k
    ON k.school_id = r.school_id
   AND k.year = r.year
   AND k.rn = 1
  WHERE r.rn > 1
),
repoint AS (
  UPDATE terms t
  SET academic_year_id = d.keep_id
  FROM dupes d
  WHERE t.academic_year_id = d.dupe_id
  RETURNING t.id
)
DELETE FROM academic_years ay
USING dupes d
WHERE ay.id = d.dupe_id;

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_school_year_unique
  ON academic_years (school_id, year);

-- At most one current academic year per school
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current_per_school
  ON academic_years (school_id)
  WHERE is_current IS TRUE;

-- At most one current term per school
CREATE UNIQUE INDEX IF NOT EXISTS terms_one_current_per_school
  ON terms (school_id)
  WHERE is_current IS TRUE;
