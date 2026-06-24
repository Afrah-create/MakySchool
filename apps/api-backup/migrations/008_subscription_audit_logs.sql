-- Subscription audit trail for term rollovers and manual reviews
CREATE TABLE IF NOT EXISTS subscription_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_term TEXT,
  previous_year INT,
  required_term TEXT NOT NULL,
  required_year INT NOT NULL,
  triggered_by UUID REFERENCES super_admins(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_audit_logs_school_id_idx
  ON subscription_audit_logs (school_id, created_at DESC);
