from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.teacher_assignments import format_class_name, get_current_term_id


async def build_overview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    term_id = await get_current_term_id(conn, school_id)

    class_count_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM school_classes WHERE school_id = $1",
        school_id,
    )
    student_count_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS count
        FROM students
        WHERE school_id = $1 AND status = 'active'
        """,
        school_id,
    )

    fee_row = await conn.fetchrow(
        """
        SELECT
          COALESCE(SUM(sfa.amount_owed), 0)::bigint AS amount_owed,
          COALESCE(SUM(sfa.amount_paid), 0)::bigint AS amount_paid
        FROM student_fee_accounts sfa
        WHERE sfa.school_id = $1
          AND (
            $2::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM fee_structures fs
              WHERE fs.id = sfa.fee_structure_id AND fs.term_id = $2
            )
          )
        """,
        school_id,
        term_id,
    )
    amount_owed = int(fee_row["amount_owed"]) if fee_row else 0
    amount_paid = int(fee_row["amount_paid"]) if fee_row else 0
    collection_rate = round((amount_paid / amount_owed) * 100, 1) if amount_owed > 0 else 0.0

    submission_rows = await conn.fetch(
        """
        SELECT status, COUNT(*)::int AS count
        FROM teacher_term_submissions
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR term_id IS NOT DISTINCT FROM $2::uuid)
        GROUP BY status
        """,
        school_id,
        term_id,
    )
    submission_status = {row["status"]: row["count"] for row in submission_rows}

    return {
        "termId": str(term_id) if term_id else None,
        "studentClassCounts": {
            "available": True,
            "classes": int(class_count_row["count"]) if class_count_row else 0,
            "students": int(student_count_row["count"]) if student_count_row else 0,
        },
        "feeCollectionRate": {
            "available": True,
            "ratePercent": collection_rate,
            "amountOwed": amount_owed,
            "amountPaid": amount_paid,
        },
        "teacherMarksSubmission": {
            "available": True,
            "byStatus": submission_status,
        },
        "bestStudents": await _build_best_students(conn, school_id, term_id),
        "weakSubjects": await _build_weak_subjects(conn, school_id, term_id),
        "attendanceTrends": await _build_attendance_trends(conn, school_id, term_id),
        "competencyAchievement": await _build_competency(conn, school_id, term_id),
    }


async def _build_attendance_trends(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID | None,
) -> dict[str, Any]:
    if term_id is None:
        return {
            "available": True,
            "averageAttendanceRate": 0.0,
            "totalAbsent": 0,
            "schoolDays": 0,
            "items": [],
        }

    row = await conn.fetchrow(
        """
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE status = 'absent')::int AS absent_count,
          COUNT(*) FILTER (WHERE status = 'late')::int AS late_count,
          COUNT(DISTINCT date)::int AS school_days
        FROM attendance
        WHERE school_id = $1 AND term_id = $2
        """,
        school_id,
        term_id,
    )
    present = int(row["present_count"]) if row else 0
    absent = int(row["absent_count"]) if row else 0
    late = int(row["late_count"]) if row else 0
    school_days = int(row["school_days"]) if row else 0
    marked = present + absent + late
    rate = round(((present + late) / marked) * 100, 1) if marked > 0 else 0.0

    return {
        "available": True,
        "averageAttendanceRate": rate,
        "totalAbsent": absent,
        "schoolDays": school_days,
        "items": [],
    }


async def _build_best_students(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID | None,
) -> dict[str, Any]:
    if term_id is None:
        return {"available": True, "items": []}

    # Prefer primary exam/sitting averages, then O-Level averages for the term.
    primary_rows = await conn.fetch(
        """
        SELECT
          s.id AS student_id,
          s.full_name AS full_name,
          sc.level,
          sc.stream,
          tr.average_percent,
          tr.aggregate,
          tr.division
        FROM primary_term_results tr
        JOIN students s ON s.id = tr.student_id
        JOIN school_classes sc ON sc.id = tr.class_id
        WHERE tr.school_id = $1
          AND tr.term_id = $2
          AND tr.average_percent IS NOT NULL
        ORDER BY tr.average_percent DESC NULLS LAST, tr.aggregate ASC NULLS LAST
        LIMIT 5
        """,
        school_id,
        term_id,
    )

    items: list[dict[str, Any]] = []
    for row in primary_rows:
        avg = float(row["average_percent"]) if row["average_percent"] is not None else None
        if avg is None:
            continue
        label = f"{avg:.0f}%"
        if row["aggregate"] is not None:
            label = f"Agg {row['aggregate']}" + (
                f" · Div {row['division']}" if row["division"] else ""
            )
        items.append(
            {
                "studentId": str(row["student_id"]),
                "fullName": row["full_name"],
                "className": format_class_name(row["level"], row["stream"]),
                "scoreLabel": label,
                "scoreValue": avg,
            }
        )

    if len(items) < 5:
        olevel_rows = await conn.fetch(
            """
            SELECT
              s.id AS student_id,
              s.full_name AS full_name,
              sc.level,
              sc.stream,
              r.average_percent,
              r.total_points
            FROM olevel_student_results r
            JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
            JOIN students s ON s.id = e.student_id
            LEFT JOIN school_classes sc ON sc.id = e.class_id
            WHERE r.school_id = $1
              AND r.term_id = $2
              AND r.average_percent > 0
            ORDER BY r.average_percent DESC, r.total_points DESC
            LIMIT $3
            """,
            school_id,
            term_id,
            5 - len(items),
        )
        seen = {i["studentId"] for i in items}
        for row in olevel_rows:
            sid = str(row["student_id"])
            if sid in seen:
                continue
            avg = float(row["average_percent"])
            class_name = (
                format_class_name(row["level"], row["stream"])
                if row["level"]
                else "O-Level"
            )
            items.append(
                {
                    "studentId": sid,
                    "fullName": row["full_name"],
                    "className": class_name,
                    "scoreLabel": f"{avg:.0f}%",
                    "scoreValue": avg,
                }
            )

    return {"available": True, "items": items[:5]}


async def _build_weak_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID | None,
) -> dict[str, Any]:
    if term_id is None:
        return {"available": True, "items": []}

    primary_rows = await conn.fetch(
        """
        SELECT
          sub.id AS subject_id,
          sub.name AS subject_name,
          ROUND(AVG(psr.final_percent)::numeric, 1) AS average_percent,
          COUNT(*)::int AS sample_size
        FROM primary_subject_results psr
        JOIN school_subjects sub ON sub.id = psr.subject_id
        WHERE psr.school_id = $1
          AND psr.term_id = $2
          AND psr.final_percent IS NOT NULL
        GROUP BY sub.id, sub.name
        HAVING COUNT(*) >= 3
        ORDER BY average_percent ASC
        LIMIT 5
        """,
        school_id,
        term_id,
    )

    items = [
        {
            "subjectId": str(row["subject_id"]),
            "subjectName": row["subject_name"],
            "averagePercent": float(row["average_percent"]),
            "sampleSize": int(row["sample_size"]),
        }
        for row in primary_rows
    ]

    if len(items) < 5:
        olevel_rows = await conn.fetch(
            """
            SELECT
              os.id AS subject_id,
              os.name AS subject_name,
              ROUND(AVG(sr.weighted_score)::numeric, 1) AS average_percent,
              COUNT(*)::int AS sample_size
            FROM olevel_subject_results sr
            JOIN olevel_subjects os ON os.id = sr.subject_id
            WHERE sr.school_id = $1
              AND sr.term_id = $2
              AND sr.weighted_score IS NOT NULL
            GROUP BY os.id, os.name
            HAVING COUNT(*) >= 3
            ORDER BY average_percent ASC
            LIMIT $3
            """,
            school_id,
            term_id,
            5 - len(items),
        )
        seen = {i["subjectId"] for i in items}
        for row in olevel_rows:
            sid = str(row["subject_id"])
            if sid in seen:
                continue
            items.append(
                {
                    "subjectId": sid,
                    "subjectName": row["subject_name"],
                    "averagePercent": float(row["average_percent"]),
                    "sampleSize": int(row["sample_size"]),
                }
            )

    if len(items) < 5:
        # Fall back to A-Level subject averages (name lives on school_subjects).
        alevel_rows = await conn.fetch(
            """
            SELECT
              als.id AS subject_id,
              COALESCE(ss.name, als.code) AS subject_name,
              ROUND(AVG(g.raw_score)::numeric, 1) AS average_percent,
              COUNT(*)::int AS sample_size
            FROM alevel_grades g
            JOIN alevel_subjects als ON als.id = g.subject_id
            LEFT JOIN school_subjects ss ON ss.id = als.school_subject_id
            WHERE g.school_id = $1
              AND g.term_id = $2
              AND g.raw_score IS NOT NULL
            GROUP BY als.id, ss.name, als.code
            HAVING COUNT(*) >= 3
            ORDER BY average_percent ASC
            LIMIT $3
            """,
            school_id,
            term_id,
            5 - len(items),
        )
        seen = {i["subjectId"] for i in items}
        for row in alevel_rows:
            sid = str(row["subject_id"])
            if sid in seen:
                continue
            items.append(
                {
                    "subjectId": sid,
                    "subjectName": row["subject_name"],
                    "averagePercent": float(row["average_percent"]),
                    "sampleSize": int(row["sample_size"]),
                }
            )

    return {"available": True, "items": items[:5]}


_LEVEL_LABELS = {4: "Excellent", 3: "Good", 2: "Fair", 1: "Poor"}


async def _build_competency(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID | None,
) -> dict[str, Any]:
    if term_id is None:
        return {
            "available": True,
            "averageLevel": 0.0,
            "averageLabel": "No data",
            "assessedCells": 0,
            "byStrand": [],
        }

    strand_rows = await conn.fetch(
        """
        SELECT
          strand,
          ROUND(AVG(level)::numeric, 2) AS average_level,
          COUNT(*)::int AS count
        FROM primary_thematic_assessments
        WHERE school_id = $1
          AND term_id = $2
        GROUP BY strand
        ORDER BY average_level DESC, strand
        """,
        school_id,
        term_id,
    )

    by_strand = [
        {
            "strand": row["strand"],
            "averageLevel": float(row["average_level"]),
            "count": int(row["count"]),
        }
        for row in strand_rows
    ]
    assessed = sum(s["count"] for s in by_strand)
    if assessed == 0:
        return {
            "available": True,
            "averageLevel": 0.0,
            "averageLabel": "No assessments yet",
            "assessedCells": 0,
            "byStrand": [],
        }

    overall = round(
        sum(s["averageLevel"] * s["count"] for s in by_strand) / assessed,
        2,
    )
    nearest = int(round(overall))
    label = _LEVEL_LABELS.get(nearest, "Developing")

    return {
        "available": True,
        "averageLevel": overall,
        "averageLabel": label,
        "assessedCells": assessed,
        "byStrand": by_strand,
    }


async def build_subjects_stub() -> dict[str, Any]:
    return {
        "available": False,
        "reason": "Use the analytics overview endpoint for subject performance.",
        "items": [],
    }
