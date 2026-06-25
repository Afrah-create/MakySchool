-- Weekly class timetables (idempotent)

CREATE TABLE IF NOT EXISTS timetable_periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id       UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id        UUID REFERENCES terms(id) ON DELETE SET NULL,
  day_of_week    SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_number  SMALLINT NOT NULL CHECK (period_number > 0),
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  subject_id     UUID NOT NULL REFERENCES school_subjects(id) ON DELETE RESTRICT,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  track          TEXT NOT NULL DEFAULT 'secular'
                   CHECK (track IN ('secular', 'theology', 'both')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  UNIQUE (school_id, class_id, day_of_week, period_number)
);

CREATE INDEX IF NOT EXISTS idx_timetable_class
  ON timetable_periods (school_id, class_id);

CREATE INDEX IF NOT EXISTS idx_timetable_teacher_day
  ON timetable_periods (school_id, teacher_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_timetable_term
  ON timetable_periods (school_id, term_id);
