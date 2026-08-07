-- Migration 066: Theology Module
-- Adds a school-configurable secular/theology/both classification to every
-- subject catalogue, and a theology competency ratings table modeled on the
-- discipline_records pattern (school/student/term scoped, simple CRUD).

-- ── Subject track classification ─────────────────────────────────────────────
-- Reuses the naming already established by timetable_periods.track.

ALTER TABLE school_subjects
  ADD COLUMN IF NOT EXISTS track TEXT NOT NULL DEFAULT 'secular'
    CHECK (track IN ('secular', 'theology', 'both'));

ALTER TABLE olevel_subjects
  ADD COLUMN IF NOT EXISTS track TEXT NOT NULL DEFAULT 'secular'
    CHECK (track IN ('secular', 'theology', 'both'));

ALTER TABLE alevel_subjects
  ADD COLUMN IF NOT EXISTS track TEXT NOT NULL DEFAULT 'secular'
    CHECK (track IN ('secular', 'theology', 'both'));

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS theology_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_school_subjects_track ON school_subjects (school_id, track);
CREATE INDEX IF NOT EXISTS idx_olevel_subjects_track ON olevel_subjects (school_id, track);
CREATE INDEX IF NOT EXISTS idx_alevel_subjects_track ON alevel_subjects (school_id, track);

-- ── Theology competency ratings ──────────────────────────────────────────────
-- One row per student per subject per term. subject_id references
-- school_subjects — theology competencies are recorded against the subject
-- being taught (e.g. Qur'an), not the school in the abstract.

CREATE TABLE IF NOT EXISTS theology_competencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id          UUID NOT NULL REFERENCES school_subjects(id) ON DELETE CASCADE,
  class_id            UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  teacher_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  term_id             UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,

  quranic_recitation  TEXT CHECK (quranic_recitation IN ('EE', 'ME', 'AE', 'BE')),
  islamic_values      TEXT CHECK (islamic_values IN ('EE', 'ME', 'AE', 'BE')),
  arabic_literacy     TEXT CHECK (arabic_literacy IN ('EE', 'ME', 'AE', 'BE')),
  moral_character     TEXT CHECK (moral_character IN ('EE', 'ME', 'AE', 'BE')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, subject_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_theology_competencies_school ON theology_competencies (school_id);
CREATE INDEX IF NOT EXISTS idx_theology_competencies_student ON theology_competencies (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_theology_competencies_teacher ON theology_competencies (teacher_id, term_id);
CREATE INDEX IF NOT EXISTS idx_theology_competencies_class ON theology_competencies (class_id, term_id);