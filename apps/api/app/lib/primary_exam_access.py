"""Primary exam access — open/closed lifecycle and teacher subject scope."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.primary_access import (
    actor_user_id,
    fetch_class_level,
    is_upper_primary,
    level_in_range,
)

EXAM_STATUSES = frozenset({"draft", "open", "closed"})

EXAM_SELECT = """
    SELECT e.id, e.school_id, e.class_id, e.term_id, e.academic_year_id,
           e.exam_type_id, e.name, e.status, e.opened_at, e.closed_at, e.notes,
           e.created_at, e.updated_at, e.deleted_at, e.deleted_by,
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
    deleted_at = row.get("deleted_at")
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
        "isOpen": row["status"] == "open" and deleted_at is None,
        "isLocked": row["status"] == "closed" or deleted_at is not None,
        "openedAt": row["opened_at"].isoformat() if row.get("opened_at") else None,
        "openedByName": row.get("opened_by_name"),
        "closedAt": row["closed_at"].isoformat() if row.get("closed_at") else None,
        "closedByName": row.get("closed_by_name"),
        "notes": row.get("notes"),
        "className": row.get("class_name"),
        "classLevel": row.get("class_level"),
        "termName": row.get("term_name"),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "deletedAt": deleted_at.isoformat() if deleted_at else None,
        "deleted": deleted_at is not None,
    }


async def fetch_exam_subject_rows(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT ps.id, ps.name, ps.code, ps.max_mark, ps.is_ple_subject, ps.display_order
        FROM primary_exam_subjects es
        JOIN primary_subjects ps ON ps.id = es.subject_id
        WHERE es.school_id = $1 AND es.exam_id = $2 AND ps.is_active = true
        ORDER BY ps.display_order, ps.name
        """,
        school_id,
        exam_id,
    )


async def list_exam_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> set[str]:
    rows = await fetch_exam_subject_rows(conn, school_id, exam_id)
    return {str(r["id"]) for r in rows}


async def resolve_default_exam_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    level: str,
) -> list[uuid.UUID]:
    """Default exam scope: PLE aggregate subjects for the class; else all cores."""
    rows = await conn.fetch(
        """
        SELECT id, applies_from, applies_to, is_ple_subject, subject_type
        FROM primary_subjects
        WHERE school_id = $1 AND is_active = true
          AND subject_type IN ('core', 'elective')
        ORDER BY display_order, name
        """,
        school_id,
    )
    in_level = [
        r
        for r in rows
        if level_in_range(level, r["applies_from"], r["applies_to"])
    ]
    ple = [r["id"] for r in in_level if r["is_ple_subject"]]
    if ple:
        return list(ple)
    return [r["id"] for r in in_level]


async def set_exam_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    subject_ids: list[uuid.UUID],
) -> None:
    if not subject_ids:
        raise ValueError("Select at least one subject for this exam.")
    valid = await conn.fetch(
        """
        SELECT id FROM primary_subjects
        WHERE school_id = $1 AND id = ANY($2::uuid[]) AND is_active = true
        """,
        school_id,
        subject_ids,
    )
    if len(valid) != len(set(subject_ids)):
        raise ValueError("One or more subjects are invalid for this school.")
    await conn.execute(
        "DELETE FROM primary_exam_subjects WHERE school_id = $1 AND exam_id = $2",
        school_id,
        exam_id,
    )
    await conn.executemany(
        """
        INSERT INTO primary_exam_subjects (exam_id, subject_id, school_id)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        """,
        [(exam_id, sid, school_id) for sid in subject_ids],
    )



async def fetch_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> dict[str, Any] | None:
    clause = "e.school_id = $1 AND e.id = $2"
    if not include_deleted:
        clause += " AND e.deleted_at IS NULL"
    row = await conn.fetchrow(
        f"{EXAM_SELECT} WHERE {clause}",
        school_id,
        exam_id,
    )
    return serialize_exam(row) if row else None


async def require_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> dict[str, Any]:
    exam = await fetch_exam(
        conn, school_id, exam_id, include_deleted=include_deleted
    )
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
    if exam.get("deleted") or exam["status"] != "open":
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
