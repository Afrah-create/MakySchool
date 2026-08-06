from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import Depends, HTTPException, status

from app.db.pool import get_db
from app.middleware.subscription_guard import require_tenant_with_subscription


async def require_theology_enabled(
    ctx: tuple[uuid.UUID, dict[str, Any]] = Depends(require_tenant_with_subscription),
    conn: asyncpg.Connection = Depends(get_db),
) -> tuple[uuid.UUID, dict[str, Any]]:
    school_id, actor = ctx
    enabled = await conn.fetchval(
        "SELECT theology_enabled FROM schools WHERE id = $1",
        school_id,
    )
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Theology is not enabled for this school.",
                "code": "THEOLOGY_NOT_ENABLED",
            },
        )
    return school_id, actor