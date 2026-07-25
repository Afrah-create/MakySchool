-- Migration 043: Per-teacher mark submissions for A-Level exams.
-- Teachers draft marks, then submit (locks their subjects). Admin/HT unlock to allow resubmit.

CREATE TABLE IF NOT EXISTS alevel_mark_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id         UUID NOT NULL REFERENCES alevel_exams(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlocked_at     TIMESTAMPTZ,
  unlocked_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, exam_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_alevel_mark_submissions_exam
  ON alevel_mark_submissions (school_id, exam_id);
