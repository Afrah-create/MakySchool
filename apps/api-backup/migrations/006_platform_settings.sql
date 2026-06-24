CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES super_admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS platform_settings_key_idx ON platform_settings (setting_key);

INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES (
  'subscription_fee_ugx',
  '300000',
  'Termly subscription fee in UGX charged to schools'
)
ON CONFLICT (setting_key) DO NOTHING;
