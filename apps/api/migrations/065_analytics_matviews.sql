-- Phase 4: Materialized views for multi-year dashboard analytics.
-- Unique indexes required for REFRESH MATERIALIZED VIEW CONCURRENTLY.

-- ---------------------------------------------------------------------------
-- mv_school_annual_summary — one row per school per academic year
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_school_annual_summary CASCADE;

CREATE MATERIALIZED VIEW mv_school_annual_summary AS
SELECT
  ay.school_id,
  ay.id AS academic_year_id,
  ay.year,
  ay.is_current,
  COALESCE(enrolled.student_count, 0)::INT AS enrolled_student_count,
  ROUND(COALESCE(perf.avg_score, 0)::NUMERIC, 2) AS avg_academic_score,
  ROUND(COALESCE(fees.collection_rate, 0)::NUMERIC, 2) AS fee_collection_rate,
  COALESCE(fees.amount_owed, 0)::BIGINT AS fee_amount_owed,
  COALESCE(fees.amount_paid, 0)::BIGINT AS fee_amount_paid,
  ROUND(COALESCE(att.attendance_rate, 0)::NUMERIC, 2) AS avg_attendance_rate,
  COALESCE(att.marked_count, 0)::INT AS attendance_marked_count,
  NOW() AS refreshed_at
FROM academic_years ay
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT h.student_id)::INT AS student_count
  FROM student_class_history h
  WHERE h.school_id = ay.school_id
    AND h.academic_year_id = ay.id
) enrolled ON TRUE
LEFT JOIN LATERAL (
  SELECT AVG(score)::FLOAT AS avg_score
  FROM (
    SELECT osr.average_percent::FLOAT AS score
    FROM olevel_student_results osr
    WHERE osr.school_id = ay.school_id
      AND osr.academic_year_id = ay.id
      AND osr.average_percent IS NOT NULL
    UNION ALL
    SELECT ptr.average_percent::FLOAT
    FROM primary_term_results ptr
    WHERE ptr.school_id = ay.school_id
      AND ptr.academic_year_id = ay.id
      AND ptr.average_percent IS NOT NULL
  ) scores
) perf ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(sfa.amount_owed), 0)::BIGINT AS amount_owed,
    COALESCE(SUM(sfa.amount_paid), 0)::BIGINT AS amount_paid,
    CASE
      WHEN COALESCE(SUM(sfa.amount_owed), 0) > 0
      THEN (SUM(sfa.amount_paid)::FLOAT / SUM(sfa.amount_owed)::FLOAT) * 100.0
      ELSE 0.0
    END AS collection_rate
  FROM student_fee_accounts sfa
  JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
  WHERE sfa.school_id = ay.school_id
    AND fs.deleted_at IS NULL
    AND (
      fs.academic_year_id = ay.id
      OR (fs.academic_year_id IS NULL AND fs.academic_year = ay.year)
    )
) fees ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::INT AS marked_count,
    CASE
      WHEN COUNT(*) > 0 THEN
        (
          COUNT(*) FILTER (WHERE a.status IN ('present', 'late'))::FLOAT
          / COUNT(*)::FLOAT
        ) * 100.0
      ELSE 0.0
    END AS attendance_rate
  FROM attendance a
  WHERE a.school_id = ay.school_id
    AND (
      a.academic_year_id = ay.id
      OR EXISTS (
        SELECT 1 FROM terms t
        WHERE t.id = a.term_id AND t.academic_year_id = ay.id
      )
    )
) att ON TRUE
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_school_annual_summary_uidx
  ON mv_school_annual_summary (school_id, academic_year_id);

CREATE INDEX IF NOT EXISTS mv_school_annual_summary_year_idx
  ON mv_school_annual_summary (school_id, year DESC);

-- ---------------------------------------------------------------------------
-- mv_class_term_summary — one row per class per term
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_class_term_summary CASCADE;

CREATE MATERIALIZED VIEW mv_class_term_summary AS
SELECT
  t.school_id,
  t.id AS term_id,
  t.academic_year_id,
  ay.year AS academic_year,
  t.name AS term_name,
  sc.id AS class_id,
  sc.level,
  sc.stream,
  COALESCE(stu.student_count, 0)::INT AS student_count,
  ROUND(COALESCE(sub.completion_rate, 0)::NUMERIC, 2) AS marks_submission_rate,
  ROUND(COALESCE(perf.avg_score, 0)::NUMERIC, 2) AS avg_subject_score,
  ROUND(COALESCE(fees.collection_rate, 0)::NUMERIC, 2) AS fee_collection_rate,
  NOW() AS refreshed_at
FROM terms t
JOIN academic_years ay ON ay.id = t.academic_year_id
JOIN school_classes sc ON sc.school_id = t.school_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INT AS student_count
  FROM students s
  WHERE s.school_id = t.school_id
    AND s.current_class_id = sc.id
    AND s.status = 'active'
) stu ON TRUE
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE tts.status = 'submitted')::FLOAT / COUNT(*)::FLOAT) * 100.0
      ELSE 0.0
    END AS completion_rate
  FROM teacher_term_submissions tts
  WHERE tts.school_id = t.school_id
    AND tts.term_id = t.id
    AND tts.class_id = sc.id
) sub ON TRUE
LEFT JOIN LATERAL (
  SELECT AVG(score)::FLOAT AS avg_score
  FROM (
    SELECT osr.average_percent::FLOAT AS score
    FROM olevel_student_results osr
    JOIN student_curriculum_enrollments e ON e.id = osr.enrollment_id
    WHERE osr.school_id = t.school_id
      AND osr.term_id = t.id
      AND e.class_id = sc.id
      AND osr.average_percent IS NOT NULL
    UNION ALL
    SELECT ptr.average_percent::FLOAT
    FROM primary_term_results ptr
    WHERE ptr.school_id = t.school_id
      AND ptr.term_id = t.id
      AND ptr.class_id = sc.id
      AND ptr.average_percent IS NOT NULL
  ) scores
) perf ON TRUE
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN COALESCE(SUM(sfa.amount_owed), 0) > 0
      THEN (SUM(sfa.amount_paid)::FLOAT / SUM(sfa.amount_owed)::FLOAT) * 100.0
      ELSE 0.0
    END AS collection_rate
  FROM student_fee_accounts sfa
  JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
  JOIN students s ON s.id = sfa.student_id
  WHERE sfa.school_id = t.school_id
    AND fs.deleted_at IS NULL
    AND s.current_class_id = sc.id
    AND (
      fs.term_id = t.id
      OR fs.academic_year_id = t.academic_year_id
      OR (fs.academic_year_id IS NULL AND fs.academic_year = ay.year)
    )
) fees ON TRUE
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_class_term_summary_uidx
  ON mv_class_term_summary (school_id, class_id, term_id);

CREATE INDEX IF NOT EXISTS mv_class_term_summary_year_idx
  ON mv_class_term_summary (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- mv_subject_performance_trend — subject × term × class
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_subject_performance_trend CASCADE;

CREATE MATERIALIZED VIEW mv_subject_performance_trend AS
SELECT
  school_id,
  academic_year_id,
  academic_year,
  term_id,
  term_name,
  class_id,
  level,
  stream,
  subject_key,
  subject_name,
  ROUND(AVG(avg_score)::NUMERIC, 2) AS average_score,
  ROUND(
    (
      (
        COUNT(*) FILTER (WHERE passed)::NUMERIC
        / NULLIF(COUNT(*), 0)::NUMERIC
      ) * 100.0
    ),
    2
  ) AS pass_rate,
  COUNT(*)::INT AS result_count,
  NOW() AS refreshed_at
FROM (
  SELECT
    osr.school_id,
    osr.academic_year_id,
    ay.year AS academic_year,
    osr.term_id,
    t.name AS term_name,
    e.class_id,
    sc.level,
    sc.stream,
    ('olevel:' || osr.subject_id::text) AS subject_key,
    COALESCE(os.name, 'Subject') AS subject_name,
    COALESCE(osr.weighted_score, 0)::FLOAT AS avg_score,
    COALESCE(osr.is_pass, false) AS passed
  FROM olevel_subject_results osr
  JOIN academic_years ay ON ay.id = osr.academic_year_id
  JOIN terms t ON t.id = osr.term_id
  JOIN student_curriculum_enrollments e ON e.id = osr.enrollment_id
  JOIN school_classes sc ON sc.id = e.class_id
  LEFT JOIN olevel_subjects os ON os.id = osr.subject_id
  WHERE osr.weighted_score IS NOT NULL

  UNION ALL

  SELECT
    psr.school_id,
    psr.academic_year_id,
    ay.year AS academic_year,
    psr.term_id,
    t.name AS term_name,
    psr.class_id,
    sc.level,
    sc.stream,
    ('primary:' || psr.subject_id::text) AS subject_key,
    COALESCE(ps.name, 'Subject') AS subject_name,
    COALESCE(psr.final_percent, 0)::FLOAT AS avg_score,
    (COALESCE(psr.final_percent, 0) >= 50) AS passed
  FROM primary_subject_results psr
  JOIN academic_years ay ON ay.id = psr.academic_year_id
  JOIN terms t ON t.id = psr.term_id
  JOIN school_classes sc ON sc.id = psr.class_id
  LEFT JOIN primary_subjects ps ON ps.id = psr.subject_id
  WHERE psr.final_percent IS NOT NULL
) raw
GROUP BY
  school_id, academic_year_id, academic_year, term_id, term_name,
  class_id, level, stream, subject_key, subject_name
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_subject_performance_trend_uidx
  ON mv_subject_performance_trend (school_id, class_id, term_id, subject_key);

CREATE INDEX IF NOT EXISTS mv_subject_performance_trend_year_idx
  ON mv_subject_performance_trend (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- Refresh helper (each CONCURRENTLY call must run outside a multi-statement
-- transaction from the application layer; this function uses non-concurrent
-- refresh for bootstrap / single-connection admin tools).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_makyschool_analytics_matviews()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_school_annual_summary;
  REFRESH MATERIALIZED VIEW mv_class_term_summary;
  REFRESH MATERIALIZED VIEW mv_subject_performance_trend;
END;
$$;
