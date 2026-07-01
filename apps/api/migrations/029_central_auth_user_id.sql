-- Link school users to central auth (Supabase) identities
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_school_unique
  ON users (auth_user_id, school_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN users.auth_user_id IS 'User id from central auth / Supabase auth.users';
