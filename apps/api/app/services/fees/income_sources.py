from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.services.fees._common import row_dict, rows_list


async def list_income_sources(conn: asyncpg.Connection, school_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, name, category, description, is_active, created_at
        FROM income_sources
        WHERE school_id = $1
        ORDER BY name ASC
        """,
        school_id,
    )
    return rows_list(rows)


async def create_income_source(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    name: str,
    category: str | None,
    description: str | None,
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO income_sources (id, school_id, name, category, description, created_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        RETURNING id, name, category, description, is_active, created_at
        """,
        school_id,
        name.strip(),
        category,
        description,
        user_id,
    )
    return row_dict(row)


async def update_income_source(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    source_id: uuid.UUID,
    *,
    name: str | None,
    category: str | None,
    description: str | None,
    is_active: bool | None,
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE income_sources
        SET name = COALESCE($3, name),
            category = COALESCE($4, category),
            description = COALESCE($5, description),
            is_active = COALESCE($6, is_active)
        WHERE id = $1 AND school_id = $2
        RETURNING id, name, category, description, is_active, created_at
        """,
        source_id,
        school_id,
        name.strip() if name else None,
        category,
        description,
        is_active,
    )
    return row_dict(row)


async def deactivate_income_source(
    conn: asyncpg.Connection, school_id: uuid.UUID, source_id: uuid.UUID
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE income_sources SET is_active = false
        WHERE id = $1 AND school_id = $2
        RETURNING id, name, category, description, is_active, created_at
        """,
        source_id,
        school_id,
    )
    return row_dict(row)
