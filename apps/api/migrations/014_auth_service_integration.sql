-- Migration: Link auth service users to schools
-- This table maps users from the central auth service to school roles

CREATE TABLE IF NOT EXISTS school_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,  -- User email from auth service
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'head_teacher', 'teacher', 'learner')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, school_id)
);

CREATE INDEX idx_school_users_email ON school_users(email);
CREATE INDEX idx_school_users_school_id ON school_users(school_id);
CREATE INDEX idx_school_users_role ON school_users(role);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_school_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER school_users_updated_at
BEFORE UPDATE ON school_users
FOR EACH ROW
EXECUTE FUNCTION update_school_users_updated_at();

COMMENT ON TABLE school_users IS 'Maps users from central auth service to school roles';
COMMENT ON COLUMN school_users.email IS 'User email from central authentication service';
