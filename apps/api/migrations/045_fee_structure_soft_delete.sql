-- Soft delete for fee structures (idempotent)

ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Replace table UNIQUE with a partial unique index so a soft-deleted
-- structure does not block creating a replacement for the same class/term/year.
ALTER TABLE fee_structures
  DROP CONSTRAINT IF EXISTS fee_structures_school_id_class_id_term_name_academic_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_active_unique
  ON fee_structures (school_id, class_id, term_name, academic_year)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fee_structures_school_active
  ON fee_structures (school_id)
  WHERE deleted_at IS NULL;
