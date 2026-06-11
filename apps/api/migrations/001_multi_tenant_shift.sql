-- MakySchool multi-tenant shift (idempotent)
-- Extends the existing single-school schema for SaaS multi-tenancy.
-- Safe to run against a database that already has legacy tables from schema.sql.
--
-- Run: npm run migrate --workspace=@makyschool/api
-- Then: npm run seed --workspace=@makyschool/api

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Migration tracking (also ensured by migrate.ts, kept here for manual runs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Platform super admins (separate from school users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Extend schools for multi-tenant SaaS
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stamp_url TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_term TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_year INT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS schoolpay_code TEXT;

-- Backfill from legacy columns where present
UPDATE schools
SET email = COALESCE(email, contact_email)
WHERE email IS NULL AND contact_email IS NOT NULL;

UPDATE schools
SET status = COALESCE(
  status,
  CASE
    WHEN is_active IS FALSE THEN 'suspended'
    ELSE 'active'
  END
)
WHERE status IS NULL;

UPDATE schools
SET subscription_status = COALESCE(subscription_status, 'unpaid')
WHERE subscription_status IS NULL;

-- Generate slugs for existing schools
UPDATE schools
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE(name, 'school')), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Resolve duplicate slugs
DO $$
DECLARE
  rec RECORD;
  suffix INT;
  candidate TEXT;
BEGIN
  FOR rec IN
    SELECT id, slug
    FROM schools
    WHERE slug IN (
      SELECT slug FROM schools GROUP BY slug HAVING COUNT(*) > 1
    )
    ORDER BY created_at NULLS LAST, id
  LOOP
    suffix := 2;
    candidate := rec.slug || '-' || suffix;
    WHILE EXISTS (SELECT 1 FROM schools WHERE slug = candidate AND id <> rec.id) LOOP
      suffix := suffix + 1;
      candidate := rec.slug || '-' || suffix;
    END LOOP;
    UPDATE schools SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE schools ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_slug_key'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_slug_key UNIQUE (slug);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_school_type_check'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_school_type_check
      CHECK (school_type IS NULL OR school_type IN ('primary', 'secondary', 'both'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_status_check'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_status_check
      CHECK (status IN ('setup', 'active', 'suspended'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_subscription_status_check'
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_subscription_status_check
      CHECK (subscription_status IN ('unpaid', 'active', 'expired'));
  END IF;
END $$;

ALTER TABLE schools ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE schools ALTER COLUMN subscription_status SET DEFAULT 'unpaid';

-- ---------------------------------------------------------------------------
-- Extend users for multi-tenant school management
-- (legacy online-learning users remain compatible)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_class_id UUID;

UPDATE users
SET name = full_name
WHERE name IS NULL AND full_name IS NOT NULL;

-- Drop global email uniqueness so the same person can exist in different schools
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_school_email_unique
  ON users (school_id, LOWER(email))
  WHERE school_id IS NOT NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_school_id_idx ON users (school_id);
CREATE INDEX IF NOT EXISTS users_school_class_id_idx ON users (school_class_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_school_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'users_school_id_fkey skipped: orphan school_id rows exist';
END $$;

-- ---------------------------------------------------------------------------
-- School management academic structure
-- (separate from legacy online-learning `classes` table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  stream TEXT,
  capacity INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS school_classes_school_id_idx ON school_classes (school_id);

CREATE TABLE IF NOT EXISTS school_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS school_subjects_school_id_idx ON school_subjects (school_id);

CREATE TABLE IF NOT EXISTS school_class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES school_subjects(id) ON DELETE CASCADE,
  UNIQUE (class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS school_class_subjects_school_id_idx ON school_class_subjects (school_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_school_class_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_school_class_id_fkey
      FOREIGN KEY (school_class_id) REFERENCES school_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Academic configuration per school
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INT NOT NULL,
  is_current BOOL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS academic_years_school_id_idx ON academic_years (school_id);

CREATE TABLE IF NOT EXISTS terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOL DEFAULT false
);

CREATE INDEX IF NOT EXISTS terms_school_id_idx ON terms (school_id);

CREATE TABLE IF NOT EXISTS grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  min_score INT NOT NULL,
  max_score INT NOT NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS grading_scales_school_id_idx ON grading_scales (school_id);

-- ---------------------------------------------------------------------------
-- Subscriptions & webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  term TEXT NOT NULL,
  year INT NOT NULL,
  schoolpay_ref TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_payments_school_id_idx ON subscription_payments (school_id);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_logs_source_created_at_idx ON webhook_logs (source, created_at DESC);
