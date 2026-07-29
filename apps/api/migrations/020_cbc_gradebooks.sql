-- ============================================================================
-- Migration 020: CBC Gradebooks & Learning Areas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CBC Learning Areas
-- ----------------------------------------------------------------------------
-- A learning area extends an existing school subject with CBC-specific settings.

CREATE TABLE IF NOT EXISTS cbc_learning_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES schools(id)
        ON DELETE CASCADE,

    school_subject_id UUID NOT NULL
        REFERENCES school_subjects(id)
        ON DELETE CASCADE,

    code TEXT NOT NULL,

    is_core BOOLEAN NOT NULL DEFAULT TRUE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (school_id, school_subject_id),
    UNIQUE (school_id, code)
);

-- ----------------------------------------------------------------------------
-- CBC Class Learning Areas
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cbc_class_learning_areas (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES schools(id)
        ON DELETE CASCADE,

    class_id UUID NOT NULL
        REFERENCES school_classes(id)
        ON DELETE CASCADE,

    learning_area_id UUID NOT NULL
        REFERENCES cbc_learning_areas(id)
        ON DELETE CASCADE,

    UNIQUE(class_id, learning_area_id)
);

-- ----------------------------------------------------------------------------
-- CBC Gradebooks
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cbc_gradebooks (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES schools(id)
        ON DELETE CASCADE,

    class_id UUID NOT NULL
        REFERENCES school_classes(id)
        ON DELETE CASCADE,

    learning_area_id UUID NOT NULL
        REFERENCES cbc_learning_areas(id)
        ON DELETE CASCADE,

    teacher_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    term_id UUID NOT NULL
        REFERENCES terms(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','submitted','locked')),

    submitted_at TIMESTAMPTZ,

    submitted_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    locked_at TIMESTAMPTZ,

    locked_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(
        school_id,
        class_id,
        learning_area_id,
        teacher_id,
        term_id
    )
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_cbc_learning_area_school
ON cbc_learning_areas(school_id);

CREATE INDEX IF NOT EXISTS idx_cbc_learning_area_subject
ON cbc_learning_areas(school_subject_id);

CREATE INDEX IF NOT EXISTS idx_cbc_class_learning_area
ON cbc_class_learning_areas(class_id);

CREATE INDEX IF NOT EXISTS idx_cbc_gradebook_school
ON cbc_gradebooks(school_id);

CREATE INDEX IF NOT EXISTS idx_cbc_gradebook_teacher
ON cbc_gradebooks(teacher_id);

CREATE INDEX IF NOT EXISTS idx_cbc_gradebook_class
ON cbc_gradebooks(class_id);

CREATE INDEX IF NOT EXISTS idx_cbc_gradebook_term
ON cbc_gradebooks(term_id);

CREATE INDEX IF NOT EXISTS idx_cbc_gradebook_status
ON cbc_gradebooks(status);