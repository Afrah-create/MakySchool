-- Prevent duplicate class entries per school (e.g. two P3A rows).
CREATE UNIQUE INDEX IF NOT EXISTS school_classes_school_level_stream_unique
  ON school_classes (school_id, level, COALESCE(stream, ''));
