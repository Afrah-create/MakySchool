-- Academic structure scalability: audit fields, uniqueness, and lookup indexes.

ALTER TABLE school_classes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE school_subjects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE school_class_subjects
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Stable ordering within a school (optional; NULL falls back to level sort in API).
ALTER TABLE school_classes
  ADD COLUMN IF NOT EXISTS sort_order INT;

-- Case-insensitive unique subject names per school.
CREATE UNIQUE INDEX IF NOT EXISTS school_subjects_school_name_unique
  ON school_subjects (school_id, LOWER(name));

-- Junction table lookups at scale.
CREATE UNIQUE INDEX IF NOT EXISTS school_class_subjects_class_subject_unique
  ON school_class_subjects (class_id, subject_id);

CREATE INDEX IF NOT EXISTS school_class_subjects_class_id_idx
  ON school_class_subjects (class_id);

CREATE INDEX IF NOT EXISTS school_class_subjects_subject_id_idx
  ON school_class_subjects (subject_id);

CREATE INDEX IF NOT EXISTS school_classes_school_level_idx
  ON school_classes (school_id, level);

CREATE INDEX IF NOT EXISTS school_classes_school_sort_idx
  ON school_classes (school_id, sort_order);
