-- Teacher attendance with GPS geofencing (idempotent)

ALTER TABLE schools ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS attendance_radius_metres INT NOT NULL DEFAULT 200;

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,

  clock_in_at     TIMESTAMPTZ,
  clock_in_lat    NUMERIC(10, 7),
  clock_in_lng    NUMERIC(10, 7),
  clock_in_accuracy_metres NUMERIC(8, 2),
  clock_in_distance_metres NUMERIC(8, 2),
  clock_in_within_fence    BOOLEAN,

  clock_out_at    TIMESTAMPTZ,
  clock_out_lat   NUMERIC(10, 7),
  clock_out_lng   NUMERIC(10, 7),
  clock_out_accuracy_metres NUMERIC(8, 2),
  clock_out_distance_metres NUMERIC(8, 2),
  clock_out_within_fence    BOOLEAN,

  duration_minutes INT,
  status          TEXT NOT NULL DEFAULT 'absent'
                    CHECK (status IN (
                      'present',
                      'late',
                      'outside_fence',
                      'absent',
                      'partial'
                    )),

  is_manual       BOOLEAN NOT NULL DEFAULT false,
  manual_reason   TEXT,
  marked_by       UUID REFERENCES users(id),

  user_agent      TEXT,
  ip_address      TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (school_id, teacher_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  clock_in_deadline     TIME NOT NULL DEFAULT '08:00:00',
  auto_absent_after     TIME NOT NULL DEFAULT '09:30:00',
  enforce_geofence      BOOLEAN NOT NULL DEFAULT true,
  allow_outside_fence   BOOLEAN NOT NULL DEFAULT false,
  radius_metres         INT,
  notify_admin_on_late  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id)
);

CREATE INDEX IF NOT EXISTS idx_ta_school_date   ON teacher_attendance(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_ta_teacher_date  ON teacher_attendance(teacher_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_ta_status        ON teacher_attendance(status);
CREATE INDEX IF NOT EXISTS idx_ta_clock_in      ON teacher_attendance(clock_in_at);
