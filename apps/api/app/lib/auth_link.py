"""Safely attach Central Auth user ids to local tenant users."""

from __future__ import annotations

import logging
import uuid

import asyncpg

logger = logging.getLogger("makyschool.auth_link")


async def link_user_auth_id(
    conn: asyncpg.Connection,
    *,
    user_id: uuid.UUID,
    school_id: uuid.UUID | None = None,
    auth_user_id: str | uuid.UUID | None,
) -> None:
    """
    Set users.auth_user_id for a local user.

    If another row in the same school already holds the id (stale duplicate),
    clear it first so password reset / login backfill do not 500 on the unique
    constraint users_auth_user_id_school_unique.
    """
    if not auth_user_id:
        return
    try:
        parsed = uuid.UUID(str(auth_user_id))
    except ValueError:
        return

    current = await conn.fetchrow(
        "SELECT id, school_id, auth_user_id FROM users WHERE id = $1 LIMIT 1",
        user_id,
    )
    if not current:
        return

    resolved_school_id = school_id or current["school_id"]
    if current["auth_user_id"] == parsed:
        return

    if resolved_school_id is not None:
        async with conn.transaction():
            cleared = await conn.execute(
                """
                UPDATE users
                SET auth_user_id = NULL, updated_at = NOW()
                WHERE school_id = $1
                  AND auth_user_id = $2
                  AND id <> $3
                """,
                resolved_school_id,
                parsed,
                user_id,
            )
            if cleared and cleared != "UPDATE 0":
                logger.info(
                    "Reclaimed auth_user_id=%s for user_id=%s school_id=%s (%s)",
                    parsed,
                    user_id,
                    resolved_school_id,
                    cleared,
                )

            await conn.execute(
                """
                UPDATE users
                SET auth_user_id = $1, updated_at = NOW()
                WHERE id = $2
                  AND (auth_user_id IS NULL OR auth_user_id <> $1)
                """,
                parsed,
                user_id,
            )
        return

    await conn.execute(
        """
        UPDATE users
        SET auth_user_id = $1, updated_at = NOW()
        WHERE id = $2
          AND (auth_user_id IS NULL OR auth_user_id <> $1)
        """,
        parsed,
        user_id,
    )
