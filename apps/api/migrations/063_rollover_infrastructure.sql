-- Phase 1: Student lifecycle, rollover session/log, data retention settings.

-- ---------------------------------------------------------------------------
-- Student graduation / transfer status
-- ---------------------------------------------------------------------------
ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_status_check;

ALTER TABLE students
  ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'withdrawn', 'graduated', 'transferred'));

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS graduation_year INT,
  ADD COLUMN IF NOT EXISTS graduation_class_id UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_status_school
  ON students (school_id, status);

-- ---------------------------------------------------------------------------
-- Rollover draft sessions (interruptible wizard state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_year_rollover_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  track                   TEXT NOT NULL
                            CHECK (track IN ('primary', 'secondary')),
  from_academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  to_academic_year_id     UUID REFERENCES academic_years(id) ON DELETE RESTRICT,
  status                  TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'completed', 'cancelled', 'failed')),
  current_step            SMALLINT NOT NULL DEFAULT 1
                            CHECK (current_step BETWEEN 1 AND 6),
  draft                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key         TEXT,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  UNIQUE (school_id, idempotency_key)
);

-- One in-progress session per school per track
CREATE UNIQUE INDEX IF NOT EXISTS rollover_sessions_one_in_progress
  ON academic_year_rollover_sessions (school_id, track)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_rollover_sessions_school
  ON academic_year_rollover_sessions (school_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Immutable rollover audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_year_rollover_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id              UUID REFERENCES academic_year_rollover_sessions(id) ON DELETE SET NULL,
  track                   TEXT NOT NULL
                            CHECK (track IN ('primary', 'secondary')),
  from_academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  to_academic_year_id     UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  performed_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  counts                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_rollover_log_school
  ON academic_year_rollover_log (school_id, performed_at DESC);

-- ---------------------------------------------------------------------------
-- UI retention thresholds (does not delete data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_data_retention_settings (
  school_id             UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  hot_years             INT NOT NULL DEFAULT 3 CHECK (hot_years >= 1 AND hot_years <= 20),
  warm_years            INT NOT NULL DEFAULT 3 CHECK (warm_years >= 0 AND warm_years <= 20),
  archive_after_years   INT NOT NULL DEFAULT 6 CHECK (archive_after_years >= 1 AND archive_after_years <= 50),
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (archive_after_years >= hot_years + warm_years)
);
