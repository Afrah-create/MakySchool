-- Teaching plans (teacher → admin/head_teacher) and subject resources (teacher CRUD, student read)

CREATE TABLE IF NOT EXISTS public.teaching_plans (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id    uuid        NOT NULL REFERENCES public.users(id),
  class_id      uuid        NOT NULL REFERENCES public.school_classes(id),
  subject_id    uuid        NOT NULL REFERENCES public.school_subjects(id),
  term_id       uuid        NOT NULL REFERENCES public.terms(id),
  title         text        NOT NULL,
  description   text,
  file_name     text        NOT NULL,
  file_size     bigint      NOT NULL CHECK (file_size > 0),
  file_type     text        NOT NULL,
  storage_key   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'deleted')),
  uploaded_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teaching_plans_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS teaching_plans_active_unique
  ON public.teaching_plans (school_id, teacher_id, class_id, subject_id, term_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_teaching_plans_school_class_term
  ON public.teaching_plans (school_id, class_id, term_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_teaching_plans_school_teacher
  ON public.teaching_plans (school_id, teacher_id)
  WHERE status IN ('pending', 'active');

CREATE TABLE IF NOT EXISTS public.subject_resources (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  school_id      uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id     uuid        NOT NULL REFERENCES public.users(id),
  class_id       uuid        NOT NULL REFERENCES public.school_classes(id),
  subject_id     uuid        NOT NULL REFERENCES public.school_subjects(id),
  term_id        uuid        REFERENCES public.terms(id),
  title          text        NOT NULL,
  description    text,
  resource_type  text        NOT NULL
                   CHECK (resource_type IN ('pdf', 'video', 'document', 'other')),
  file_name      text        NOT NULL,
  file_size      bigint      NOT NULL CHECK (file_size > 0),
  file_type      text        NOT NULL,
  storage_key    text        NOT NULL,
  is_published   boolean     NOT NULL DEFAULT false,
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'deleted')),
  sort_order     int         NOT NULL DEFAULT 0,
  published_at   timestamptz,
  uploaded_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subject_resources_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_subject_resources_class_subject
  ON public.subject_resources (school_id, class_id, subject_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subject_resources_teacher
  ON public.subject_resources (school_id, teacher_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_subject_resources_published
  ON public.subject_resources (school_id, class_id, subject_id, is_published)
  WHERE status = 'active' AND is_published = true;
