CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  term TEXT NOT NULL,
  year INT NOT NULL,
  schoolpay_ref TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);