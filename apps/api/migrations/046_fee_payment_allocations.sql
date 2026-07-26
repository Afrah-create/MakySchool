-- Per-item payment allocations (idempotent)

CREATE TABLE IF NOT EXISTS fee_payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payment_id       UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_item_id  UUID NOT NULL REFERENCES invoice_items(id) ON DELETE RESTRICT,
  amount           BIGINT NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (payment_id, invoice_item_id)
);

CREATE INDEX IF NOT EXISTS idx_fpa_payment ON fee_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_fpa_invoice ON fee_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fpa_item ON fee_payment_allocations(invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_fpa_school ON fee_payment_allocations(school_id);

-- Helpful index for linking payments to open invoices by structure
CREATE INDEX IF NOT EXISTS idx_invoices_student_structure
  ON invoices(student_id, fee_structure_id)
  WHERE status NOT IN ('cancelled', 'voided');
