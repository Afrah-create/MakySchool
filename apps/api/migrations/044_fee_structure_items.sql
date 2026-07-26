-- Fee structure line items + soft lock (idempotent)

CREATE TABLE IF NOT EXISTS fee_structure_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_structure_id   UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  account_id         UUID REFERENCES accounts(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,
  amount             BIGINT NOT NULL CHECK (amount > 0),
  sort_order         INT NOT NULL DEFAULT 0,
  is_optional        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_structure_items_structure
  ON fee_structure_items(fee_structure_id);

CREATE INDEX IF NOT EXISTS idx_fee_structure_items_school
  ON fee_structure_items(school_id);

ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT;

-- Backfill one default item per existing structure (idempotent)
INSERT INTO fee_structure_items
  (school_id, fee_structure_id, description, amount, sort_order)
SELECT
  fs.school_id,
  fs.id,
  COALESCE(NULLIF(TRIM(fs.description), ''), 'School fees'),
  fs.amount,
  0
FROM fee_structures fs
WHERE NOT EXISTS (
  SELECT 1 FROM fee_structure_items i
  WHERE i.fee_structure_id = fs.id
)
AND fs.amount > 0;
