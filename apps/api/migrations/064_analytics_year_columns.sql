-- Phase 4 prep: denormalize academic_year_id onto high-volume tables.
-- Additive backfill only. Enables matviews and future partitioning.

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

UPDATE attendance a
SET academic_year_id = t.academic_year_id
FROM terms t
WHERE a.term_id = t.id
  AND a.academic_year_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_school_year
  ON attendance (school_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_attendance_year_date
  ON attendance (academic_year_id, date)
  WHERE academic_year_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- fee_payments (via fee account → structure year)
-- ---------------------------------------------------------------------------
ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE RESTRICT;

UPDATE fee_payments fp
SET academic_year_id = fs.academic_year_id
FROM student_fee_accounts sfa
JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
WHERE fp.fee_account_id = sfa.id
  AND fp.academic_year_id IS NULL
  AND fs.academic_year_id IS NOT NULL;

UPDATE fee_payments fp
SET academic_year_id = ay.id
FROM student_fee_accounts sfa
JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
JOIN academic_years ay
  ON ay.school_id = fs.school_id
 AND ay.year = fs.academic_year
WHERE fp.fee_account_id = sfa.id
  AND fp.academic_year_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fee_payments_school_year
  ON fee_payments (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- Supporting indexes for analytics
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_class_history_year
  ON student_class_history (school_id, academic_year_id)
  WHERE academic_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_structures_year_id
  ON fee_structures (school_id, academic_year_id)
  WHERE deleted_at IS NULL AND academic_year_id IS NOT NULL;
