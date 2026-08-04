"""Materialized view refresh and multi-year analytics reads."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import asyncpg

logger = logging.getLogger("makyschool.analytics")

MATVIEWS = (
    "mv_school_annual_summary",
    "mv_class_term_summary",
    "mv_subject_performance_trend",
)


async def refresh_analytics_matviews(
    conn: asyncpg.Connection,
    *,
    concurrently: bool = True,
) -> dict[str, Any]:
    """
    Refresh analytics matviews.

    CONCURRENTLY cannot run inside a transaction block — caller must not wrap
    this in `async with conn.transaction()` when concurrently=True.
    """
    started = time.perf_counter()
    refreshed: list[str] = []
    mode = "CONCURRENTLY" if concurrently else ""
    for view in MATVIEWS:
        sql = f"REFRESH MATERIALIZED VIEW {mode} {view}".replace("  ", " ").strip()
        await conn.execute(sql)
        refreshed.append(view)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info("Analytics matviews refreshed views=%s elapsed_ms=%s", refreshed, elapsed_ms)
    return {"refreshed": refreshed, "elapsedMs": elapsed_ms, "concurrently": concurrently}


async def fetch_annual_summary(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          academic_year_id,
          year,
          is_current,
          enrolled_student_count,
          avg_academic_score,
          fee_collection_rate,
          fee_amount_owed,
          fee_amount_paid,
          avg_attendance_rate,
          attendance_marked_count,
          refreshed_at
        FROM mv_school_annual_summary
        WHERE school_id = $1
        ORDER BY year ASC
        LIMIT $2
        """,
        school_id,
        limit,
    )
    return [
        {
            "academicYearId": str(r["academic_year_id"]),
            "year": int(r["year"]),
            "isCurrent": bool(r["is_current"]),
            "enrolledStudentCount": int(r["enrolled_student_count"] or 0),
            "avgAcademicScore": float(r["avg_academic_score"] or 0),
            "feeCollectionRate": float(r["fee_collection_rate"] or 0),
            "feeAmountOwed": int(r["fee_amount_owed"] or 0),
            "feeAmountPaid": int(r["fee_amount_paid"] or 0),
            "avgAttendanceRate": float(r["avg_attendance_rate"] or 0),
            "attendanceMarkedCount": int(r["attendance_marked_count"] or 0),
            "refreshedAt": r["refreshed_at"].isoformat() if r["refreshed_at"] else None,
        }
        for r in rows
    ]


async def fetch_class_trends(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    academic_year_id: uuid.UUID | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          term_id,
          academic_year_id,
          academic_year,
          term_name,
          class_id,
          level,
          stream,
          student_count,
          marks_submission_rate,
          avg_subject_score,
          fee_collection_rate,
          refreshed_at
        FROM mv_class_term_summary
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2)
        ORDER BY academic_year ASC, term_name, level, stream
        LIMIT $3
        """,
        school_id,
        academic_year_id,
        limit,
    )
    return [
        {
            "termId": str(r["term_id"]),
            "academicYearId": str(r["academic_year_id"]),
            "academicYear": int(r["academic_year"]),
            "termName": r["term_name"],
            "classId": str(r["class_id"]),
            "level": r["level"],
            "stream": r["stream"],
            "classLabel": f"{r['level']}{r['stream'] or ''}",
            "studentCount": int(r["student_count"] or 0),
            "marksSubmissionRate": float(r["marks_submission_rate"] or 0),
            "avgSubjectScore": float(r["avg_subject_score"] or 0),
            "feeCollectionRate": float(r["fee_collection_rate"] or 0),
            "refreshedAt": r["refreshed_at"].isoformat() if r["refreshed_at"] else None,
        }
        for r in rows
    ]


async def fetch_subject_trends(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    academic_year_id: uuid.UUID | None = None,
    limit: int = 300,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          academic_year_id,
          academic_year,
          term_id,
          term_name,
          class_id,
          level,
          stream,
          subject_key,
          subject_name,
          average_score,
          pass_rate,
          result_count,
          refreshed_at
        FROM mv_subject_performance_trend
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2)
        ORDER BY academic_year ASC, term_name, subject_name
        LIMIT $3
        """,
        school_id,
        academic_year_id,
        limit,
    )
    return [
        {
            "academicYearId": str(r["academic_year_id"]),
            "academicYear": int(r["academic_year"]),
            "termId": str(r["term_id"]),
            "termName": r["term_name"],
            "classId": str(r["class_id"]),
            "classLabel": f"{r['level']}{r['stream'] or ''}",
            "subjectKey": r["subject_key"],
            "subjectName": r["subject_name"],
            "averageScore": float(r["average_score"] or 0),
            "passRate": float(r["pass_rate"] or 0),
            "resultCount": int(r["result_count"] or 0),
            "refreshedAt": r["refreshed_at"].isoformat() if r["refreshed_at"] else None,
        }
        for r in rows
    ]
