-- Migration 019: CBC Continuous Assessment Module
-- Creates Continuous Assessments and Student Assessment Scores

-- ============================================================================
-- Continuous Assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS continuous_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES schools(id)
        ON DELETE CASCADE,

    class_id UUID NOT NULL
        REFERENCES school_classes(id)
        ON DELETE CASCADE,

    subject_id UUID NOT NULL
        REFERENCES school_subjects(id)
        ON DELETE CASCADE,

    teacher_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    term_id UUID NOT NULL
        REFERENCES terms(id)
        ON DELETE CASCADE,

    title TEXT NOT NULL,

    assessment_type TEXT NOT NULL
        CHECK (
            assessment_type IN (
                'assignment',
                'project',
                'group_work',
                'practical',
                'participation',
                'presentation',
                'test'
            )
        ),

    assessment_date DATE NOT NULL,

    max_score NUMERIC(6,2) NOT NULL
        CHECK (max_score > 0),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted')),

    submitted_at TIMESTAMPTZ,

    submitted_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    unlocked_at TIMESTAMPTZ,

    unlocked_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        school_id,
        class_id,
        subject_id,
        term_id,
        title
    )
);

-- ============================================================================
-- Student Assessment Scores
-- ============================================================================

CREATE TABLE IF NOT EXISTS assessment_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    assessment_id UUID NOT NULL
        REFERENCES continuous_assessments(id)
        ON DELETE CASCADE,

    student_id UUID NOT NULL
        REFERENCES students(id)
        ON DELETE CASCADE,

    score NUMERIC(6,2) NOT NULL
        CHECK (score >= 0),

    remarks TEXT,

    entered_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (assessment_id, student_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ca_school
ON continuous_assessments(school_id);

CREATE INDEX IF NOT EXISTS idx_ca_class
ON continuous_assessments(class_id);

CREATE INDEX IF NOT EXISTS idx_ca_subject
ON continuous_assessments(subject_id);

CREATE INDEX IF NOT EXISTS idx_ca_term
ON continuous_assessments(term_id);

CREATE INDEX IF NOT EXISTS idx_ca_teacher
ON continuous_assessments(teacher_id);

CREATE INDEX IF NOT EXISTS idx_ca_status
ON continuous_assessments(status);

CREATE INDEX IF NOT EXISTS idx_ca_class_subject_term
ON continuous_assessments(class_id, subject_id, term_id);

CREATE INDEX IF NOT EXISTS idx_ca_scores_assessment
ON assessment_scores(assessment_id);

CREATE INDEX IF NOT EXISTS idx_ca_scores_student
ON assessment_scores(student_id);