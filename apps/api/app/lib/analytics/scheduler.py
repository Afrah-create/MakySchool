"""Nightly analytics matview refresh inside FastAPI lifespan."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.db.pool import get_pool
from app.lib.analytics.matviews import refresh_analytics_matviews

logger = logging.getLogger("makyschool.analytics")

# Refresh around 02:15 UTC nightly (low traffic for UG schools).
_REFRESH_HOUR_UTC = 2
_REFRESH_MINUTE_UTC = 15


def _seconds_until_next_refresh(now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    target = now.replace(
        hour=_REFRESH_HOUR_UTC,
        minute=_REFRESH_MINUTE_UTC,
        second=0,
        microsecond=0,
    )
    if target <= now:
        target = target + timedelta(days=1)
    return max(30.0, (target - now).total_seconds())


async def analytics_refresh_loop(stop_event: asyncio.Event) -> None:
    """Long-running task: sleep until the next window, refresh, repeat."""
    logger.info(
        "Analytics matview refresh loop started (daily %02d:%02d UTC)",
        _REFRESH_HOUR_UTC,
        _REFRESH_MINUTE_UTC,
    )
    while not stop_event.is_set():
        delay = _seconds_until_next_refresh()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=delay)
            break
        except asyncio.TimeoutError:
            pass

        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                # CONCURRENTLY must not run inside an explicit transaction.
                result = await refresh_analytics_matviews(conn, concurrently=True)
            logger.info("Nightly analytics refresh complete %s", result)
        except Exception:
            logger.exception("Nightly analytics matview refresh failed")


def start_analytics_refresh_task() -> tuple[asyncio.Task[None], asyncio.Event]:
    stop_event = asyncio.Event()
    task = asyncio.create_task(analytics_refresh_loop(stop_event), name="analytics-matview-refresh")
    return task, stop_event
