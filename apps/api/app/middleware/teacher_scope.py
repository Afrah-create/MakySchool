import uuid
from typing import Any

import asyncpg
from fastapi import Depends, HTTPException, status

from app.db.pool import get_db
from app.middleware.tenant import get_tenant_and_user


async def get_allowed_class_ids(
    ctx: tuple[uuid.UUID, dict[str, Any]] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> list[uuid.UUID] | None:
    school_id, user = ctx
    role = user["role"]
    if role in ("admin", "head_teacher"):
        return None
    if role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    from app.lib.academic_years import get_current_academic_year_id

    year_id = await get_current_academic_year_id(conn, school_id)
    if year_id is None:
        return []

    rows = await conn.fetch(
        """
        SELECT DISTINCT class_id
        FROM teacher_class_assignments
        WHERE school_id = $1
          AND teacher_id = $2
          AND academic_year_id = $3
        """,
        school_id,
        user["user_db_id"],
        year_id,
    )
    return [row["class_id"] for row in rows]


def assert_class_access(allowed_class_ids: list[uuid.UUID] | None, class_id: uuid.UUID) -> bool:
    if allowed_class_ids is None:
        return True
    return class_id in allowed_class_ids
