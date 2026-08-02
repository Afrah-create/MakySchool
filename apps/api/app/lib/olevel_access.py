"""O-Level access: school_type gate, class levels, teacher subject scope."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.classes import O_LEVEL_CLASS_LEVELS, get_school_type
from app.lib.permissions import can


def school_offers_olevel(school_type: str | None) -> bool:
    return school_type in ("secondary", "both")


async def assert_olevel_enabled(conn: asyncpg.Connection, school_id: uuid.UUID) -> str:
    school_type = await get_school_type(conn, school_id)
    if not school_offers_olevel(school_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "O-Level is only available for schools set up as "
                    "secondary or both primary and secondary."
                ),
                "code": "OLEVEL_NOT_ENABLED",
            },
        )
    return school_type or "secondary"


def require_olevel_action(actor: dict[str, Any], action: str) -> None:
    role = (actor.get("role") or "").lower()
    if role == "student":
        role = "learner"
    if not can(role, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission for this O-Level action.",
                "code": "FORBIDDEN",
            },
        )


def actor_user_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def is_olevel_level(level: str) -> bool:
    return level in O_LEVEL_CLASS_LEVELS


async def fetch_class_level(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> str:
    row = await conn.fetchrow(
        """
        SELECT level FROM school_classes
        WHERE id = $1 AND school_id = $2
        """,
        class_id,
        school_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Class not found.", "code": "NOT_FOUND"},
        )
    level = row["level"]
    if not is_olevel_level(level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "O-Level only applies to S1–S4 classes.",
                "code": "NOT_OLEVEL_CLASS",
            },
        )
    return level


async def teacher_olevel_subject_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
) -> set[str]:
    """O-Level subject IDs the teacher is assigned to teach in this class."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT os.id
        FROM teacher_class_assignments tca
        JOIN olevel_subjects os
          ON os.school_subject_id = tca.subject_id
         AND os.school_id = tca.school_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = $2
          AND tca.class_id = $3
          AND tca.subject_id IS NOT NULL
          AND os.is_active = true
        """,
        school_id,
        teacher_id,
        class_id,
    )
    return {str(r["id"]) for r in rows}


async def assert_teacher_can_mark_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> None:
    allowed = await teacher_olevel_subject_ids(conn, school_id, teacher_id, class_id)
    if str(subject_id) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "You are not assigned to teach this subject in this class. "
                    "Ask an admin to update your teaching load."
                ),
                "code": "NOT_ASSIGNED",
            },
        )


async def teacher_assigned_olevel_class_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> list[uuid.UUID]:
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
        list(O_LEVEL_CLASS_LEVELS),
    )
    return [r["id"] for r in rows]
