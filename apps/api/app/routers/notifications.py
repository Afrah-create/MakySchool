"""In-app notifications REST + SSE endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Annotated, Any, AsyncIterator, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from jose import JWTError
from pydantic import BaseModel, Field

from app.db.pool import get_db, get_pool
from app.lib.jwt_utils import verify_tenant_token
from app.lib.notification_events import ALL_NOTIFICATION_TYPES
from app.lib.notifications import (
    count_unread,
    get_sse_queue,
    register_sse_queue,
    serialize_notification_row,
    unregister_sse_queue,
    utc_now_iso,
)
from app.lib.user_sql import USER_DISPLAY_NAME_SQL, normalize_user_role
from app.middleware.auth import extract_tenant_access_token
from app.middleware.subscription_guard import require_tenant_with_subscription

logger = logging.getLogger("makyschool.notifications")

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


def _actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def _sse_format(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


async def _resolve_sse_identity(
    request: Request, conn: asyncpg.Connection
) -> tuple[uuid.UUID, uuid.UUID, str]:
    """Authenticate SSE without subscription Depends (long-lived connection)."""
    token = extract_tenant_access_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )
    try:
        payload = verify_tenant_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )

    slug = (request.headers.get("x-school-slug") or "").strip().lower()
    if not slug:
        slug = (payload.get("schoolSlug") or "").strip().lower()
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing tenant context", "code": "TENANT_CONTEXT_REQUIRED"},
        )

    school_row = await conn.fetchrow(
        "SELECT id FROM schools WHERE slug = $1 LIMIT 1", slug
    )
    if not school_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "School not found"},
        )
    school_id = school_row["id"]

    try:
        user_uuid = uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )

    user_row = await conn.fetchrow(
        f"""
        SELECT u.id, u.role,
               COALESCE(u.is_active, u.account_status = 'ACTIVE' OR u.account_status IS NULL) AS is_active,
               {USER_DISPLAY_NAME_SQL} AS name
        FROM users u
        WHERE u.id = $1 AND u.school_id = $2
        LIMIT 1
        """,
        user_uuid,
        school_id,
    )
    if not user_row or not user_row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )

    return school_id, user_row["id"], normalize_user_role(user_row["role"])


@router.get("/stream")
async def notification_stream(request: Request):
    pool = await get_pool()
    async with pool.acquire() as auth_conn:
        school_id, user_id, _role = await _resolve_sse_identity(request, auth_conn)
        unread = await count_unread(auth_conn, school_id, user_id)
        conn_row = await auth_conn.fetchrow(
            """
            INSERT INTO notification_sse_connections (school_id, user_id)
            VALUES ($1, $2)
            RETURNING id
            """,
            school_id,
            user_id,
        )
        connection_id = conn_row["id"]

    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    register_sse_queue(user_id, queue)

    async def event_generator() -> AsyncIterator[str]:
        try:
            yield _sse_format("connected", {"unreadCount": unread})
            yield _sse_format("unread_count", {"count": unread})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=30.0)
                    event_name = item.get("event", "notification")
                    data = item.get("data", item)
                    yield _sse_format(event_name, data)
                except asyncio.TimeoutError:
                    # Keep-alive ping + update last_ping_at
                    try:
                        pool2 = await get_pool()
                        async with pool2.acquire() as ping_conn:
                            await ping_conn.execute(
                                """
                                UPDATE notification_sse_connections
                                SET last_ping_at = now()
                                WHERE id = $1
                                """,
                                connection_id,
                            )
                    except Exception:
                        logger.debug("Failed to update SSE last_ping_at", exc_info=True)
                    yield _sse_format("ping", {"timestamp": utc_now_iso()})
        except (asyncio.CancelledError, GeneratorExit):
            raise
        finally:
            unregister_sse_queue(user_id)
            try:
                pool3 = await get_pool()
                async with pool3.acquire() as cleanup_conn:
                    await cleanup_conn.execute(
                        "DELETE FROM notification_sse_connections WHERE id = $1",
                        connection_id,
                    )
            except Exception:
                logger.debug("Failed to delete SSE connection row", exc_info=True)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("")
@router.get("/")
async def list_notifications(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    is_read: Optional[bool] = Query(None),
    is_archived: bool = Query(False),
    type: Optional[str] = Query(None),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)

    clauses = [
        "school_id = $1",
        "recipient_id = $2",
        "is_archived = $3",
    ]
    args: list[Any] = [school_id, recipient_id, is_archived]
    idx = 4

    if is_read is not None:
        clauses.append(f"is_read = ${idx}")
        args.append(is_read)
        idx += 1
    if type:
        clauses.append(f"type = ${idx}")
        args.append(type)
        idx += 1

    where = " AND ".join(clauses)
    total = await conn.fetchval(
        f"SELECT COUNT(*)::int FROM notifications WHERE {where}",
        *args,
    )
    rows = await conn.fetch(
        f"""
        SELECT id, school_id, recipient_id, actor_id, type, title, body,
               resource_type, resource_id, metadata, is_read, read_at,
               is_archived, archived_at, created_at
        FROM notifications
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *args,
        limit,
        offset,
    )
    unread = await count_unread(conn, school_id, recipient_id)
    return {
        "data": {
            "notifications": [serialize_notification_row(r) for r in rows],
            "total": int(total or 0),
            "unread_count": unread,
        }
    }


@router.get("/unread-count")
async def get_unread_count(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    count = await count_unread(conn, school_id, _actor_id(actor))
    return {"data": {"count": count}}


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)
    row = await conn.fetchrow(
        """
        UPDATE notifications
        SET is_read = true, read_at = COALESCE(read_at, now())
        WHERE id = $1 AND school_id = $2 AND recipient_id = $3
        RETURNING id, school_id, recipient_id, actor_id, type, title, body,
                  resource_type, resource_id, metadata, is_read, read_at,
                  is_archived, archived_at, created_at
        """,
        notification_id,
        school_id,
        recipient_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Notification not found", "code": "NOT_FOUND"},
        )
    return {"data": serialize_notification_row(row)}


@router.patch("/read-all")
async def mark_all_read(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)
    result = await conn.execute(
        """
        UPDATE notifications
        SET is_read = true, read_at = now()
        WHERE school_id = $1 AND recipient_id = $2 AND is_read = false
        """,
        school_id,
        recipient_id,
    )
    # asyncpg returns "UPDATE N"
    updated = int(result.split()[-1]) if result else 0
    return {"data": {"updated": updated}}


@router.patch("/{notification_id}/archive")
async def archive_notification(
    notification_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)
    existing = await conn.fetchrow(
        """
        SELECT id, is_read
        FROM notifications
        WHERE id = $1 AND school_id = $2 AND recipient_id = $3
        """,
        notification_id,
        school_id,
        recipient_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Notification not found", "code": "NOT_FOUND"},
        )
    if not existing["is_read"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Only read notifications can be archived",
                "code": "VALIDATION_ERROR",
            },
        )
    row = await conn.fetchrow(
        """
        UPDATE notifications
        SET is_archived = true, archived_at = now()
        WHERE id = $1 AND school_id = $2 AND recipient_id = $3
        RETURNING id, school_id, recipient_id, actor_id, type, title, body,
                  resource_type, resource_id, metadata, is_read, read_at,
                  is_archived, archived_at, created_at
        """,
        notification_id,
        school_id,
        recipient_id,
    )
    return {"data": serialize_notification_row(row)}


@router.patch("/archive-read")
async def archive_all_read(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)
    result = await conn.execute(
        """
        UPDATE notifications
        SET is_archived = true, archived_at = now()
        WHERE school_id = $1
          AND recipient_id = $2
          AND is_read = true
          AND is_archived = false
        """,
        school_id,
        recipient_id,
    )
    archived = int(result.split()[-1]) if result else 0
    return {"data": {"archived": archived}}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    recipient_id = _actor_id(actor)
    result = await conn.execute(
        """
        DELETE FROM notifications
        WHERE id = $1 AND school_id = $2 AND recipient_id = $3
        """,
        notification_id,
        school_id,
        recipient_id,
    )
    deleted = int(result.split()[-1]) if result else 0
    if deleted == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Notification not found", "code": "NOT_FOUND"},
        )
    return {"data": {"deleted": True}}


@router.get("/preferences")
async def get_preferences(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    user_id = _actor_id(actor)
    rows = await conn.fetch(
        """
        SELECT type, in_app_enabled
        FROM notification_preferences
        WHERE school_id = $1 AND user_id = $2
        """,
        school_id,
        user_id,
    )
    by_type = {row["type"]: bool(row["in_app_enabled"]) for row in rows}
    preferences = [
        {
            "type": t,
            "inAppEnabled": by_type.get(t, True),
        }
        for t in ALL_NOTIFICATION_TYPES
    ]
    return {"data": {"preferences": preferences}}


class PreferenceItem(BaseModel):
    type: str = Field(min_length=1, max_length=120)
    in_app_enabled: bool


class PreferencesBody(BaseModel):
    preferences: list[PreferenceItem]


@router.patch("/preferences")
async def update_preferences(
    body: PreferencesBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    user_id = _actor_id(actor)
    if not body.preferences:
        return {"data": {"updated": 0}}

    types = [p.type for p in body.preferences]
    enabled = [p.in_app_enabled for p in body.preferences]
    school_ids = [school_id] * len(types)
    user_ids = [user_id] * len(types)

    await conn.execute(
        """
        INSERT INTO notification_preferences (school_id, user_id, type, in_app_enabled, updated_at)
        SELECT school_id, user_id, type, in_app_enabled, now()
        FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::boolean[])
          AS t(school_id, user_id, type, in_app_enabled)
        ON CONFLICT (user_id, type)
        DO UPDATE SET
          in_app_enabled = EXCLUDED.in_app_enabled,
          updated_at = now()
        """,
        school_ids,
        user_ids,
        types,
        enabled,
    )
    return {"data": {"updated": len(types)}}
