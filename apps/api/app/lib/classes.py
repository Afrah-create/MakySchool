import uuid
from typing import Literal

import asyncpg

SchoolType = Literal["primary", "secondary", "both"]

PRIMARY_CLASS_LEVELS = ("P1", "P2", "P3", "P4", "P5", "P6", "P7")
SECONDARY_CLASS_LEVELS = ("S1", "S2", "S3", "S4", "S5", "S6")
# Advanced level — the only classes that take subject combinations.
A_LEVEL_CLASS_LEVELS = ("S5", "S6")


def get_levels_for_school_type(school_type: SchoolType | str | None) -> list[str]:
    if school_type == "secondary":
        return list(SECONDARY_CLASS_LEVELS)
    if school_type == "both":
        return list(PRIMARY_CLASS_LEVELS) + list(SECONDARY_CLASS_LEVELS)
    return list(PRIMARY_CLASS_LEVELS)


def format_class_label(level: str, stream: str | None) -> str:
    return f"{level}{stream or ''}"


def is_level_allowed_for_school_type(level: str, school_type: SchoolType | str | None) -> bool:
    return level in get_levels_for_school_type(school_type)


async def get_school_type(conn: asyncpg.Connection, school_id: uuid.UUID) -> SchoolType | str | None:
    row = await conn.fetchrow(
        "SELECT school_type FROM schools WHERE id = $1",
        school_id,
    )
    return row["school_type"] if row else None


def get_allowed_levels_sql_param(school_type: SchoolType | str | None) -> list[str]:
    return get_levels_for_school_type(school_type)


def build_level_order_case(column_ref: str, school_type: SchoolType | str | None) -> str:
    levels = get_levels_for_school_type(school_type)
    if not levels:
        return "0"

    cases = " ".join(
        f"WHEN {column_ref} = '{level}' THEN {index}" for index, level in enumerate(levels)
    )
    return f"CASE {cases} ELSE {len(levels)} END"


async def find_duplicate_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    level: str,
    stream: str | None,
    exclude_id: uuid.UUID | None = None,
) -> bool:
    row = await conn.fetchrow(
        """
        SELECT id FROM school_classes
        WHERE school_id = $1
          AND level = $2
          AND COALESCE(stream, '') = COALESCE($3, '')
          AND ($4::uuid IS NULL OR id <> $4)
        LIMIT 1
        """,
        school_id,
        level,
        stream or "",
        exclude_id,
    )
    return row is not None
