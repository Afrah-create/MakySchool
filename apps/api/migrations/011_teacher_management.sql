-- Teacher management: term submission scaffold + profile tracking (idempotent)

CREATE TABLE IF NOT EXISTS teacher_term_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'draft', 'submitted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, class_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_tts_teacher ON teacher_term_submissions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tts_school ON teacher_term_submissions(school_id);
CREATE INDEX IF NOT EXISTS idx_tts_class ON teacher_term_submissions(class_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
