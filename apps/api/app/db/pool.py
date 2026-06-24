from contextvars import ContextVar
from typing import AsyncGenerator

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None
_request_conn: ContextVar[asyncpg.Connection | None] = ContextVar(
    "request_db_conn", default=None
)


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=20,
            command_timeout=30,
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """One connection per request — safe for nested FastAPI dependencies."""
    existing = _request_conn.get()
    if existing is not None:
        yield existing
        return

    pool = await get_pool()
    conn = await pool.acquire()
    token = _request_conn.set(conn)
    try:
        yield conn
    finally:
        _request_conn.reset(token)
        await pool.release(conn)
