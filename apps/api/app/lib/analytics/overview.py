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
        "bestStudents": {
            "available": False,
            "reason": "Available once the marks module ships.",
            "items": [],
        },
        "weakSubjects": {
            "available": False,
            "reason": "Available once the marks module ships.",
            "items": [],
        },
        "attendanceTrends": {
            "available": False,
            "reason": "Available once the attendance module ships.",
            "items": [],
        },
        "competencyAchievement": {
            "available": False,
            "reason": "Available once the competency module ships.",
            "items": [],
        },
    }


async def build_subjects_stub() -> dict[str, Any]:
    return {
        "available": False,
        "reason": "Available once the marks module ships.",
        "items": [],
    }
