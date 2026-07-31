"""Primary module access — school_type gate + class level helpers."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.classes import PRIMARY_CLASS_LEVELS, get_school_type
from app.lib.permissions import can


def school_offers_primary(school_type: str | None) -> bool:
    return school_type in ("primary", "both")


async def assert_primary_enabled(conn: asyncpg.Connection, school_id: uuid.UUID) -> str:
    school_type = await get_school_type(conn, school_id)
    if not school_offers_primary(school_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": (
                    "Primary reports are only available for schools set up as "
                    "primary or both primary and secondary."
                ),
                "code": "PRIMARY_NOT_ENABLED",
            },
        )
    return school_type or "primary"


def require_primary_action(actor: dict[str, Any], action: str) -> None:
    role = (actor.get("role") or "").lower()
    if role == "student":
        role = "learner"
    if not can(role, action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission for this primary action.",
                "code": "FORBIDDEN",
            },
        )


def actor_user_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def is_lower_primary(level: str) -> bool:
    return level in ("P1", "P2", "P3")


def is_upper_primary(level: str) -> bool:
    return level in ("P4", "P5", "P6", "P7")


def is_primary_level(level: str) -> bool:
    return level in PRIMARY_CLASS_LEVELS


LEVEL_ORDER = {level: i for i, level in enumerate(PRIMARY_CLASS_LEVELS)}


def level_in_range(level: str, applies_from: str, applies_to: str) -> bool:
    if level not in LEVEL_ORDER or applies_from not in LEVEL_ORDER or applies_to not in LEVEL_ORDER:
        return False
    return LEVEL_ORDER[applies_from] <= LEVEL_ORDER[level] <= LEVEL_ORDER[applies_to]


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
    if not is_primary_level(level):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Primary reports only apply to P1–P7 classes.",
                "code": "NOT_PRIMARY_CLASS",
            },
        )
    return level
