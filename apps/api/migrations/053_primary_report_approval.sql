-- Primary report approval (A-Level-aligned) + generated_at fix support

ALTER TABLE primary_term_results
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_primary_term_results_approved
  ON primary_term_results (school_id, student_id)
  WHERE approved_at IS NOT NULL;
