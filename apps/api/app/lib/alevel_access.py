"""A-Level access helpers: term locks (open exams) and teacher subject scope."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status


async def fetch_term_lock(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT l.locked_at, l.locked_by, u.full_name AS locked_by_name
        FROM alevel_term_locks l
        LEFT JOIN users u ON u.id = l.locked_by
        WHERE l.school_id = $1 AND l.class_id = $2 AND l.term_id = $3
        """,
        school_id,
        class_id,
        term_id,
    )
    if not row:
        return None
    return {
        "isLocked": True,
        "lockedAt": row["locked_at"].isoformat() if row["locked_at"] else None,
        "lockedBy": str(row["locked_by"]) if row["locked_by"] else None,
        "lockedByName": row["locked_by_name"],
    }


async def assert_exam_open(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
) -> None:
    """Reject grade entry when the class-term exam is locked (closed)."""
    locked = await fetch_term_lock(conn, school_id, class_id, term_id)
    if locked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": (
                    "This exam is closed. Grades for this class and term are locked. "
                    "Ask an admin to reopen the exam before making changes."
                ),
                "code": "EXAM_LOCKED",
                **locked,
            },
        )


async def teacher_alevel_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    """A-Level subject profile IDs the teacher is assigned to teach in this class.

    Assignments live on school_subjects; profiles link via school_subject_id.
    """
    rows = await conn.fetch(
        """
        SELECT DISTINCT als.id
        FROM teacher_class_assignments tca
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
    """Ensure the teacher teaches at least one A-Level subject in the class.

    Returns the set of alevel_subjects.id they may enter marks for.
    """
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
