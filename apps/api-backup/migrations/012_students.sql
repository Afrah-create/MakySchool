-- Student registration & management (idempotent)
-- Note: numbered 012 because 005_subscription_payment_status.sql already exists.

CREATE TABLE IF NOT EXISTS students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id          TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  date_of_birth       DATE,
  gender              TEXT CHECK (gender IN ('male', 'female', 'other')),
  photo_url           TEXT,
  current_class_id    UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'withdrawn')),
  withdrawal_reason   TEXT,
  withdrawn_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, learner_id)
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  relationship  TEXT DEFAULT 'parent'
                  CHECK (relationship IN ('parent', 'guardian', 'sibling', 'other')),
  is_primary    BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS student_guardians_one_primary_idx
  ON student_guardians (student_id)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS student_class_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  enrolled_at   TIMESTAMPTZ DEFAULT NOW(),
  left_at       TIMESTAMPTZ,
  reason        TEXT,
  moved_by      UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learner_id_sequences (
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  prefix      TEXT NOT NULL,
  year        INT  NOT NULL,
  next_seq    INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (school_id, year)
);

CREATE TABLE IF NOT EXISTS student_import_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  imported_by   UUID REFERENCES users(id),
  filename      TEXT,
  total_rows    INT DEFAULT 0,
  imported      INT DEFAULT 0,
  failed        INT DEFAULT 0,
  errors        JSONB,
  status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'complete', 'partial', 'failed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_school      ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class       ON students(current_class_id);
CREATE INDEX IF NOT EXISTS idx_students_status      ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_learner_id  ON students(school_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_sch_student          ON student_class_history(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student    ON student_guardians(student_id);
