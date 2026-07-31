"""Primary exam access — open/closed lifecycle and teacher subject scope."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.primary_access import actor_user_id, fetch_class_level, is_upper_primary

EXAM_STATUSES = frozenset({"draft", "open", "closed"})

EXAM_SELECT = """
    SELECT e.id, e.school_id, e.class_id, e.term_id, e.academic_year_id,
           e.exam_type_id, e.name, e.status, e.opened_at, e.closed_at, e.notes,
           e.created_at, e.updated_at,
           et.name AS exam_type_name, et.code AS exam_type_code,
           t.name AS term_name,
           CASE
             WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
             ELSE sc.level || ' ' || sc.stream
           END AS class_name,
           sc.level AS class_level,
           ou.full_name AS opened_by_name,
           cu.full_name AS closed_by_name
    FROM primary_exams e
    JOIN primary_exam_types et ON et.id = e.exam_type_id
    JOIN terms t ON t.id = e.term_id
    JOIN school_classes sc ON sc.id = e.class_id
    LEFT JOIN users ou ON ou.id = e.opened_by
    LEFT JOIN users cu ON cu.id = e.closed_by
"""


def serialize_exam(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "schoolId": str(row["school_id"]),
        "classId": str(row["class_id"]),
        "termId": str(row["term_id"]),
        "academicYearId": str(row["academic_year_id"]),
        "examTypeId": str(row["exam_type_id"]),
        "examTypeName": row.get("exam_type_name"),
        "examTypeCode": row.get("exam_type_code"),
        "name": row["name"],
        "status": row["status"],
        "isOpen": row["status"] == "open",
        "isLocked": row["status"] == "closed",
        "openedAt": row["opened_at"].isoformat() if row.get("opened_at") else None,
        "openedByName": row.get("opened_by_name"),
        "closedAt": row["closed_at"].isoformat() if row.get("closed_at") else None,
        "closedByName": row.get("closed_by_name"),
        "notes": row.get("notes"),
        "className": row.get("class_name"),
        "classLevel": row.get("class_level"),
        "termName": row.get("term_name"),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }


async def fetch_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        f"{EXAM_SELECT} WHERE e.school_id = $1 AND e.id = $2",
        school_id,
        exam_id,
    )
    return serialize_exam(row) if row else None


async def require_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await fetch_exam(conn, school_id, exam_id)
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Exam not found.", "code": "EXAM_NOT_FOUND"},
        )
    return exam


async def assert_exam_open(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id)
    if exam["status"] != "open":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": "This exam is not open for mark entry.",
                "code": "EXAM_LOCKED",
            },
        )
    return exam


async def teacher_primary_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    """Primary subject profile ids the teacher may grade for this class."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT ps.id
        FROM teacher_class_assignments tca
        JOIN primary_subjects ps
          ON ps.school_subject_id = tca.subject_id
         AND ps.school_id = tca.school_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = $2
          AND tca.class_id = $3
          AND tca.subject_id IS NOT NULL
          AND ps.is_active = true
        """,
        school_id,
        teacher_id,
        class_id,
    )
    return {str(r["id"]) for r in rows}


async def teacher_assigned_primary_class_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> list[uuid.UUID]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT tca.class_id
        FROM teacher_class_assignments tca
        JOIN school_classes sc ON sc.id = tca.class_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = $2
          AND sc.level = ANY($3::text[])
        """,
        school_id,
        teacher_id,
        ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
    )
    return [r["class_id"] for r in rows]


async def assert_teacher_can_grade_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    level = await fetch_class_level(conn, school_id, class_id)
    if not is_upper_primary(level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Subject exams apply to P4–P7. Use thematic assessment for lower primary.",
                "code": "NOT_UPPER_PRIMARY",
            },
        )
    subject_ids = await teacher_primary_subject_ids(
        conn, school_id, teacher_id, class_id
    )
    if not subject_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "You are not assigned to teach any primary subjects in this class. "
                    "Ask an admin to assign you on Teaching load after installing subjects."
                ),
                "code": "NOT_ASSIGNED",
            },
        )
    return subject_ids


async def fetch_teacher_submission(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT id, submitted_at
        FROM primary_mark_submissions
        WHERE school_id = $1 AND exam_id = $2 AND teacher_id = $3
        """,
        school_id,
        exam_id,
        teacher_id,
    )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "submittedAt": row["submitted_at"].isoformat(),
    }


async def assert_teacher_can_edit_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> None:
    sub = await fetch_teacher_submission(conn, school_id, exam_id, teacher_id)
    if sub:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": "You have already submitted marks for this exam. Ask an admin to unlock.",
                "code": "MARKS_SUBMITTED",
            },
        )


async def list_exam_submissions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT s.teacher_id, s.submitted_at, u.full_name AS teacher_name
        FROM primary_mark_submissions s
        JOIN users u ON u.id = s.teacher_id
        WHERE s.school_id = $1 AND s.exam_id = $2
        ORDER BY u.full_name
        """,
        school_id,
        exam_id,
    )
    return [
        {
            "teacherId": str(r["teacher_id"]),
            "teacherName": r["teacher_name"],
            "submittedAt": r["submitted_at"].isoformat(),
        }
        for r in rows
    ]
