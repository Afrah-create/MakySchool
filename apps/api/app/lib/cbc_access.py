"""CBC Continuous Assessment access helpers."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status


def _serialize_assessment(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "schoolId": str(row["school_id"]),
        "classId": str(row["class_id"]),
        "subjectId": str(row["subject_id"]),
        "teacherId": str(row["teacher_id"]),
        "termId": str(row["term_id"]),
        "title": row["title"],
        "assessmentType": row["assessment_type"],
        "assessmentDate": row["assessment_date"].isoformat(),
        "maxScore": float(row["max_score"]),
        "status": row["status"],
        "submittedAt": (
            row["submitted_at"].isoformat()
            if row["submitted_at"]
            else None
        ),
        "submittedBy": (
            str(row["submitted_by"])
            if row["submitted_by"]
            else None
        ),
        "unlockedAt": (
            row["unlocked_at"].isoformat()
            if row["unlocked_at"]
            else None
        ),
        "unlockedBy": (
            str(row["unlocked_by"])
            if row["unlocked_by"]
            else None
        ),
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
    }


ASSESSMENT_SELECT = """
SELECT
    ca.*
FROM continuous_assessments ca
"""


async def fetch_assessment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        f"""
        {ASSESSMENT_SELECT}
        WHERE ca.school_id = $1
          AND ca.id = $2
        """,
        school_id,
        assessment_id,
    )

    return _serialize_assessment(row) if row else None


async def require_assessment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
) -> dict[str, Any]:
    assessment = await fetch_assessment(
        conn,
        school_id,
        assessment_id,
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "Assessment not found.",
                "code": "ASSESSMENT_NOT_FOUND",
            },
        )

    return assessment


async def assert_assessment_open(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
) -> dict[str, Any]:
    assessment = await require_assessment(
        conn,
        school_id,
        assessment_id,
    )

    if assessment["status"] == "submitted":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": "Assessment has already been submitted.",
                "code": "ASSESSMENT_LOCKED",
            },
        )

    return assessment


async def assert_teacher_can_edit(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> dict[str, Any]:
    assessment = await require_assessment(
        conn,
        school_id,
        assessment_id,
    )

    if assessment["teacherId"] != str(teacher_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You are not the owner of this assessment.",
                "code": "FORBIDDEN",
            },
        )

    if assessment["status"] == "submitted":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "error": "Assessment has already been submitted.",
                "code": "ASSESSMENT_LOCKED",
            },
        )

    return assessment


async def submit_assessment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> None:
    await conn.execute(
        """
        UPDATE continuous_assessments
        SET
            status='submitted',
            submitted_at=NOW(),
            submitted_by=$3,
            updated_at=NOW()
        WHERE school_id=$1
          AND id=$2
        """,
        school_id,
        assessment_id,
        teacher_id,
    )


async def unlock_assessment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    assessment_id: uuid.UUID,
    admin_id: uuid.UUID,
) -> None:
    await conn.execute(
        """
        UPDATE continuous_assessments
        SET
            status='draft',
            unlocked_at=NOW(),
            unlocked_by=$3,
            updated_at=NOW()
        WHERE school_id=$1
          AND id=$2
        """,
        school_id,
        assessment_id,
        admin_id,
    )