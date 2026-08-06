"""Core in-app notification library: create, route, and push via SSE.

Process-local SSE queues — works with a single uvicorn worker. If the API is
scaled to multiple workers, replace in-memory queues with Redis pub/sub.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg

from app.db.pool import get_pool

logger = logging.getLogger("makyschool.notifications")

# user_id (str) -> asyncio.Queue of SSE event dicts
_sse_queues: dict[str, asyncio.Queue] = {}

_cleanup_task: asyncio.Task[None] | None = None
_cleanup_stop: asyncio.Event | None = None


def register_sse_queue(user_id: str | uuid.UUID, queue: asyncio.Queue) -> None:
    _sse_queues[str(user_id)] = queue


def unregister_sse_queue(user_id: str | uuid.UUID) -> None:
    _sse_queues.pop(str(user_id), None)


def get_sse_queue(user_id: str | uuid.UUID) -> asyncio.Queue | None:
    return _sse_queues.get(str(user_id))


async def push_sse_event(user_id: str | uuid.UUID, event_data: dict[str, Any]) -> None:
    queue = get_sse_queue(user_id)
    if queue is None:
        return
    try:
        queue.put_nowait(event_data)
    except asyncio.QueueFull:
        logger.warning("SSE queue full for user %s; dropping event", user_id)


def serialize_notification_row(row: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    get = row.get if isinstance(row, dict) else row.__getitem__
    metadata = get("metadata")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    elif metadata is None:
        metadata = {}

    created_at = get("created_at")
    read_at = get("read_at")
    archived_at = get("archived_at")
    resource_id = get("resource_id")
    actor_id = get("actor_id")

    return {
        "id": str(get("id")),
        "type": get("type"),
        "title": get("title"),
        "body": get("body"),
        "resourceType": get("resource_type"),
        "resourceId": str(resource_id) if resource_id else None,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "isRead": bool(get("is_read")),
        "readAt": read_at.isoformat() if read_at else None,
        "isArchived": bool(get("is_archived")),
        "archivedAt": archived_at.isoformat() if archived_at else None,
        "actorId": str(actor_id) if actor_id else None,
        "createdAt": created_at.isoformat() if created_at else None,
    }


async def _filter_recipients_by_preference(
    conn: asyncpg.Connection,
    *,
    event_type: str,
    recipients: list[uuid.UUID],
) -> list[uuid.UUID]:
    if not recipients:
        return []
    opted_out = await conn.fetch(
        """
        SELECT user_id
        FROM notification_preferences
        WHERE type = $1
          AND in_app_enabled = false
          AND user_id = ANY($2::uuid[])
        """,
        event_type,
        recipients,
    )
    blocked = {row["user_id"] for row in opted_out}
    return [rid for rid in recipients if rid not in blocked]


async def notify(
    conn: asyncpg.Connection,
    event_type: str,
    actor_id: uuid.UUID | None,
    school_id: uuid.UUID,
    recipients: list[uuid.UUID],
    title: str,
    body: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> int:
    """Create one notification per recipient and push to online SSE queues."""
    # Deduplicate while preserving order
    seen: set[uuid.UUID] = set()
    unique: list[uuid.UUID] = []
    for rid in recipients:
        if rid is None:
            continue
        if actor_id is not None and rid == actor_id:
            continue
        if rid in seen:
            continue
        seen.add(rid)
        unique.append(rid)

    eligible = await _filter_recipients_by_preference(
        conn, event_type=event_type, recipients=unique
    )
    if not eligible:
        return 0

    meta = metadata or {}
    meta_json = json.dumps(meta, default=str)
    n = len(eligible)
    ids = [uuid.uuid4() for _ in range(n)]
    school_ids = [school_id] * n
    actor_ids = [actor_id] * n
    types = [event_type] * n
    titles = [title] * n
    bodies = [body] * n
    resource_types = [resource_type] * n
    resource_ids = [resource_id] * n
    metadatas = [meta_json] * n

    rows = await conn.fetch(
        """
        INSERT INTO notifications (
          id, school_id, recipient_id, actor_id, type, title, body,
          resource_type, resource_id, metadata
        )
        SELECT
          id, school_id, recipient_id, actor_id, type, title, body,
          resource_type, resource_id, metadata::jsonb
        FROM unnest(
          $1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::text[],
          $6::text[], $7::text[], $8::text[], $9::uuid[], $10::text[]
        ) AS t(
          id, school_id, recipient_id, actor_id, type,
          title, body, resource_type, resource_id, metadata
        )
        RETURNING id, school_id, recipient_id, actor_id, type, title, body,
                  resource_type, resource_id, metadata, is_read, read_at,
                  is_archived, archived_at, created_at
        """,
        ids,
        school_ids,
        eligible,
        actor_ids,
        types,
        titles,
        bodies,
        resource_types,
        resource_ids,
        metadatas,
    )

    push_tasks = []
    for row in rows:
        payload = serialize_notification_row(row)
        recipient_id = str(row["recipient_id"])
        push_tasks.append(
            push_sse_event(
                recipient_id,
                {"event": "notification", "data": payload},
            )
        )
        # Also push updated unread count for connected users
        push_tasks.append(_push_unread_count(conn, school_id, row["recipient_id"]))

    if push_tasks:
        await asyncio.gather(*push_tasks, return_exceptions=True)

    return len(rows)


async def _push_unread_count(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    recipient_id: uuid.UUID,
) -> None:
    if get_sse_queue(recipient_id) is None:
        return
    count = await count_unread(conn, school_id, recipient_id)
    await push_sse_event(
        recipient_id,
        {"event": "unread_count", "data": {"count": count}},
    )


async def notify_role(
    conn: asyncpg.Connection,
    event_type: str,
    actor_id: uuid.UUID | None,
    school_id: uuid.UUID,
    role: str,
    title: str,
    body: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> int:
    rows = await conn.fetch(
        """
        SELECT id
        FROM users
        WHERE school_id = $1
          AND LOWER(role) = LOWER($2)
          AND is_active = true
        """,
        school_id,
        role,
    )
    recipients = [row["id"] for row in rows]
    return await notify(
        conn,
        event_type,
        actor_id,
        school_id,
        recipients,
        title,
        body,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata=metadata,
    )


async def notify_roles(
    conn: asyncpg.Connection,
    event_type: str,
    actor_id: uuid.UUID | None,
    school_id: uuid.UUID,
    roles: list[str],
    title: str,
    body: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> int:
    if not roles:
        return 0
    rows = await conn.fetch(
        """
        SELECT id
        FROM users
        WHERE school_id = $1
          AND LOWER(role) = ANY($2::text[])
          AND is_active = true
        """,
        school_id,
        [r.lower() for r in roles],
    )
    recipients = [row["id"] for row in rows]
    return await notify(
        conn,
        event_type,
        actor_id,
        school_id,
        recipients,
        title,
        body,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata=metadata,
    )


async def notify_user(
    conn: asyncpg.Connection,
    event_type: str,
    actor_id: uuid.UUID | None,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    body: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> int:
    return await notify(
        conn,
        event_type,
        actor_id,
        school_id,
        [user_id],
        title,
        body,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata=metadata,
    )


async def count_unread(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    recipient_id: uuid.UUID,
) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COUNT(*)::int
            FROM notifications
            WHERE school_id = $1
              AND recipient_id = $2
              AND is_read = false
              AND is_archived = false
            """,
            school_id,
            recipient_id,
        )
        or 0
    )


async def notify_in_background(
    *,
    event_coro_factory,
) -> None:
    """Run notification work on a fresh pool connection (for large fan-outs)."""

    async def _run() -> None:
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await event_coro_factory(conn)
        except Exception:
            logger.exception("Background notification task failed")

    asyncio.create_task(_run())


async def cleanup_stale_sse_connections_loop(stop_event: asyncio.Event) -> None:
    """Remove SSE connection rows whose last_ping_at is older than 2 minutes."""
    logger.info("SSE connection cleanup loop started (every 5 minutes)")
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=300.0)
            break
        except asyncio.TimeoutError:
            pass

        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                deleted = await conn.execute(
                    """
                    DELETE FROM notification_sse_connections
                    WHERE last_ping_at < now() - interval '2 minutes'
                    """
                )
            logger.debug("SSE cleanup: %s", deleted)
        except Exception:
            logger.exception("SSE connection cleanup failed")


def start_sse_cleanup_task() -> tuple[asyncio.Task[None], asyncio.Event]:
    stop_event = asyncio.Event()
    task = asyncio.create_task(
        cleanup_stale_sse_connections_loop(stop_event),
        name="notification-sse-cleanup",
    )
    return task, stop_event


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
