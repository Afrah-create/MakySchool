CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT,
  logo_url TEXT,
  stamp_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  school_type TEXT CHECK (school_type IN ('primary', 'secondary', 'both')),
  status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'suspended')),
  subscription_status TEXT DEFAULT 'unpaid' CHECK (subscription_status IN ('unpaid', 'active', 'expired')),
  subscription_term TEXT,
  subscription_year INT,
  schoolpay_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);