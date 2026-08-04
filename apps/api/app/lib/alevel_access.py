"""A-Level access helpers: exam status (open/closed) and teacher subject scope."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.classes import get_school_type

EXAM_STATUSES = frozenset({"draft", "open", "closed"})


def school_offers_alevel(school_type: str | None) -> bool:
    return school_type in ("secondary", "both")


async def assert_alevel_enabled(conn: asyncpg.Connection, school_id: uuid.UUID) -> str:
    school_type = await get_school_type(conn, school_id)
    if not school_offers_alevel(school_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "A-Level is only available for schools set up as "
                    "secondary or both primary and secondary."
                ),
                "code": "ALEVEL_NOT_ENABLED",
            },
        )
    return school_type or "secondary"


def _serialize_exam(row: asyncpg.Record) -> dict[str, Any]:
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
        "termName": row.get("term_name"),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }


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
           ou.full_name AS opened_by_name,
           cu.full_name AS closed_by_name
    FROM alevel_exams e
    JOIN alevel_exam_types et ON et.id = e.exam_type_id
    JOIN terms t ON t.id = e.term_id
    JOIN school_classes sc ON sc.id = e.class_id
    LEFT JOIN users ou ON ou.id = e.opened_by
    LEFT JOIN users cu ON cu.id = e.closed_by
"""


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
    return _serialize_exam(row) if row else None


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
    """Reject grade entry unless the exam status is open."""
    exam = await require_exam(conn, school_id, exam_id)
    if exam["status"] != "open":
        label = "not open yet" if exam["status"] == "draft" else "closed"
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": (
                    f"This exam is {label}. Grades cannot be entered until an "
                    "admin opens the exam for marking."
                ),
                "code": "EXAM_LOCKED",
                "examId": exam["id"],
                "status": exam["status"],
            },
        )
    return exam


async def teacher_alevel_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    """A-Level subject profile IDs the teacher is assigned to teach in this class."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT als.id
        FROM teacher_class_assignments tca
        JOIN academic_years ay
          ON ay.id = tca.academic_year_id
         AND ay.school_id = tca.school_id
         AND ay.is_current = true
        JOIN alevel_subjects als
          ON als.school_subject_id = tca.subject_id
         AND als.school_id = tca.school_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = $2
          AND tca.class_id = $3
          AND tca.subject_id IS NOT NULL
          AND als.is_active = true
        """,
        school_id,
        teacher_id,
        class_id,
    )
    return {str(r["id"]) for r in rows}


async def teacher_assigned_alevel_class_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> list[uuid.UUID]:
    """S5/S6 classes where the teacher has at least one subject assignment."""
    from app.lib.classes import A_LEVEL_CLASS_LEVELS

    rows = await conn.fetch(
        """
        SELECT DISTINCT sc.id
        FROM teacher_class_assignments tca
        JOIN academic_years ay
          ON ay.id = tca.academic_year_id
         AND ay.school_id = tca.school_id
         AND ay.is_current = true
        JOIN school_classes sc ON sc.id = tca.class_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = $2
          AND tca.subject_id IS NOT NULL
          AND sc.level = ANY($3::text[])
        ORDER BY sc.id
        """,
        school_id,
        teacher_id,
        list(A_LEVEL_CLASS_LEVELS),
    )
    return [r["id"] for r in rows]


async def assert_teacher_can_grade_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    """Ensure the teacher teaches at least one A-Level subject in the class."""
    allowed = await teacher_alevel_subject_ids(conn, school_id, teacher_id, class_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "You are not assigned to teach any A-Level subject in this class. "
                    "Ask an admin to update your teaching load."
                ),
                "code": "NOT_ASSIGNED",
            },
        )
    return allowed


async def fetch_teacher_submission(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT s.submitted_at, s.unlocked_at, s.unlocked_by,
               u.full_name AS unlocked_by_name
        FROM alevel_mark_submissions s
        LEFT JOIN users u ON u.id = s.unlocked_by
        WHERE s.school_id = $1 AND s.exam_id = $2 AND s.teacher_id = $3
        """,
        school_id,
        exam_id,
        teacher_id,
    )
    if not row:
        return None
    return {
        "isSubmitted": True,
        "submittedAt": row["submitted_at"].isoformat() if row["submitted_at"] else None,
        "unlockedAt": row["unlocked_at"].isoformat() if row["unlocked_at"] else None,
        "unlockedByName": row["unlocked_by_name"],
    }


async def list_exam_submissions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT s.teacher_id, s.submitted_at, s.unlocked_at,
               t.full_name AS teacher_name,
               u.full_name AS unlocked_by_name
        FROM alevel_mark_submissions s
        JOIN users t ON t.id = s.teacher_id
        LEFT JOIN users u ON u.id = s.unlocked_by
        WHERE s.school_id = $1 AND s.exam_id = $2
        ORDER BY t.full_name
        """,
        school_id,
        exam_id,
    )
    return [
        {
            "teacherId": str(r["teacher_id"]),
            "teacherName": r["teacher_name"],
            "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
            "unlockedAt": r["unlocked_at"].isoformat() if r["unlocked_at"] else None,
            "unlockedByName": r["unlocked_by_name"],
            "isLocked": True,
        }
        for r in rows
    ]


async def assert_teacher_can_edit_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> None:
    """Reject edits when the teacher has already submitted for this exam."""
    submitted = await fetch_teacher_submission(conn, school_id, exam_id, teacher_id)
    if submitted:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": (
                    "You have already submitted marks for this exam. "
                    "Ask an admin or head teacher to unlock if you need to resubmit."
                ),
                "code": "MARKS_SUBMITTED",
                **submitted,
            },
        )