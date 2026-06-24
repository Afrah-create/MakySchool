import asyncio
import uuid
from typing import Any

import asyncpg
from cachetools import TTLCache
from fastapi import Depends, HTTPException, Request, status

from app.db.pool import get_db
from app.lib.user_sql import USER_DISPLAY_NAME_SQL, normalize_user_role
from app.middleware.auth import get_current_user

_slug_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)
_cache_lock = asyncio.Lock()

TENANT_HEADER_SLUG = "x-school-slug"


async def resolve_tenant(
    request: Request,
    conn: asyncpg.Connection = Depends(get_db),
) -> uuid.UUID:
    slug = (request.headers.get(TENANT_HEADER_SLUG) or "").strip().lower()
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing tenant context", "code": "TENANT_CONTEXT_REQUIRED"},
        )

    async with _cache_lock:
        cached = _slug_cache.get(slug)
    if cached:
        return cached

    row = await conn.fetchrow(
        "SELECT id FROM schools WHERE slug = $1 LIMIT 1",
        slug,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "School not found"},
        )

    school_id = row["id"]
    async with _cache_lock:
        _slug_cache[slug] = school_id
    return school_id


async def invalidate_tenant_cache(slug: str) -> None:
    async with _cache_lock:
        _slug_cache.pop(slug.lower(), None)


async def get_tenant_and_user(
    request: Request,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> tuple[uuid.UUID, dict[str, Any]]:
    slug = (request.headers.get(TENANT_HEADER_SLUG) or "").strip().lower()
    if not slug:
        slug = (current_user.get("schoolSlug") or "").strip().lower()
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing tenant context", "code": "TENANT_CONTEXT_REQUIRED"},
        )

    async with _cache_lock:
        cached = _slug_cache.get(slug)
    if cached:
        school_id = cached
    else:
        row = await conn.fetchrow(
            "SELECT id FROM schools WHERE slug = $1 LIMIT 1",
            slug,
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "School not found"},
            )
        school_id = row["id"]
        async with _cache_lock:
            _slug_cache[slug] = school_id

    jwt_school_id = current_user.get("schoolId")
    if jwt_school_id and uuid.UUID(str(jwt_school_id)) != school_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Forbidden", "code": "TENANT_MISMATCH"},
        )

    user_row = await conn.fetchrow(
        f"""
        SELECT u.id, u.role,
               COALESCE(u.is_active, u.account_status = 'ACTIVE' OR u.account_status IS NULL) AS is_active,
               {USER_DISPLAY_NAME_SQL} AS name,
               u.email
        FROM users u
        WHERE u.id = $1 AND u.school_id = $2
        LIMIT 1
        """,
        uuid.UUID(str(current_user["sub"])),
        school_id,
    )
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Forbidden", "code": "TENANT_MISMATCH"},
        )
    if not user_row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Your account has been deactivated. Contact your school administrator.",
                "code": "ACCOUNT_DEACTIVATED",
            },
        )

    role = normalize_user_role(user_row["role"])
    enriched = {
        **current_user,
        "role": role,
        "user_db_id": user_row["id"],
        "name": user_row["name"],
        "email": user_row["email"],
    }
    return school_id, enriched


def require_permission(action: str):
    async def check(
        ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    ) -> tuple[uuid.UUID, dict]:
        _school_id, user = ctx
        from app.lib.permissions import can

        if not can(user["role"], action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "Forbidden"},
            )
        return ctx

    return check
