-- Legacy schema.sql linked updated_by to users(id); platform settings are
-- managed by super_admins. Repoint the FK so subscription fee updates work.
ALTER TABLE platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_updated_by_fkey;

UPDATE platform_settings
SET updated_by = NULL
WHERE updated_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM super_admins sa WHERE sa.id = platform_settings.updated_by);

ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES super_admins(id) ON DELETE SET NULL;

INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES (
  'subscription_fee_ugx',
  '300000',
  'Termly subscription fee in UGX charged to schools'
)
ON CONFLICT (setting_key) DO NOTHING;
