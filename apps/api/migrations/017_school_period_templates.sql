-- School-wide teaching period definitions (bell schedule)

CREATE TABLE IF NOT EXISTS school_period_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_number  SMALLINT NOT NULL CHECK (period_number > 0),
  label          TEXT,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  UNIQUE (school_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_school_period_templates_school
  ON school_period_templates (school_id, period_number);
