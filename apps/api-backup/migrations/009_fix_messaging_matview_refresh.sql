-- Legacy messaging stats materialized views must be populated once before CONCURRENTLY works.
-- Triggers on class_members/messages call refresh_messaging_stats(), which failed on empty views.

CREATE OR REPLACE FUNCTION public.refresh_messaging_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public'
      AND matviewname = 'mv_class_learner_counts'
      AND NOT ispopulated
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_class_learner_counts;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_class_learner_counts;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public'
      AND matviewname = 'mv_user_message_stats'
      AND NOT ispopulated
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_user_message_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_message_stats;
  END IF;

  RETURN NULL;
END;
$$;

-- Populate any views that were created WITH NO DATA (ispopulated = false).
DO $$
BEGIN
  IF to_regclass('public.mv_class_learner_counts') IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_class_learner_counts' AND NOT ispopulated
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_class_learner_counts;
  END IF;

  IF to_regclass('public.mv_user_message_stats') IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_user_message_stats' AND NOT ispopulated
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_user_message_stats;
  END IF;
END;
$$;
