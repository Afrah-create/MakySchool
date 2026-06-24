-- Pending MakyPay collections and payment metadata
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS payment_reference UUID,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE subscription_payments
  ALTER COLUMN paid_at DROP NOT NULL;

UPDATE subscription_payments
SET status = 'completed', paid_at = COALESCE(paid_at, created_at, NOW())
WHERE status IS NULL OR status = '';

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_payment_reference_idx
  ON subscription_payments (payment_reference)
  WHERE payment_reference IS NOT NULL;
