from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import asyncpg

from app.lib.password import verify_password

LoginTable = Literal["users", "super_admins"]

_LOCKOUT_TABLES = frozenset({"users", "super_admins"})


@dataclass(frozen=True)
class LoginLockoutResult:
    ok: bool
    status: int
    error: str
    code: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def minutes_until_unlock(locked_until: datetime) -> int:
    remaining = (locked_until - _utcnow()).total_seconds()
    if remaining <= 0:
        return 0
    return max(1, math.ceil(remaining / 60))


def locked_until_for_attempts(attempts: int, now: datetime) -> datetime | None:
    if attempts >= 10:
        return now + timedelta(hours=1)
    if attempts >= 5:
        return now + timedelta(minutes=15)
    return None


def _locked_message(locked_until: datetime) -> str:
    minutes = minutes_until_unlock(locked_until)
    unit = "minute" if minutes == 1 else "minutes"
    return f"Account locked. Try again in {minutes} {unit}."


def _validate_table(table: str) -> LoginTable:
    if table not in _LOCKOUT_TABLES:
        raise ValueError(f"Unsupported login lockout table: {table}")
    return table  # type: ignore[return-value]


async def verify_login_with_lockout(
    conn: asyncpg.Connection,
    *,
    table: LoginTable,
    user_id: uuid.UUID,
    password: str,
) -> LoginLockoutResult:
    """Atomically check lock state, verify password, and update lockout counters."""
    table = _validate_table(table)
    now = _utcnow()

    async with conn.transaction():
        row = await conn.fetchrow(
            f"""
            SELECT password_hash, failed_login_attempts, locked_until
            FROM {table}
            WHERE id = $1
            FOR UPDATE
            """,
            user_id,
        )
        if not row or not row["password_hash"]:
            return LoginLockoutResult(ok=False, status=401, error="Invalid credentials")

        locked_until = row["locked_until"]
        if locked_until is not None and locked_until > now:
            return LoginLockoutResult(
                ok=False,
                status=403,
                error=_locked_message(locked_until),
                code="ACCOUNT_LOCKED",
            )

        if not verify_password(password, row["password_hash"]):
            attempts = int(row["failed_login_attempts"]) + 1
            new_lock = locked_until_for_attempts(attempts, now)
            await conn.execute(
                f"""
                UPDATE {table}
                SET failed_login_attempts = $2,
                    locked_until = $3,
                    last_failed_login = $4
                WHERE id = $1
                """,
                user_id,
                attempts,
                new_lock,
                now,
            )
            return LoginLockoutResult(ok=False, status=401, error="Invalid credentials")

        await conn.execute(
            f"""
            UPDATE {table}
            SET failed_login_attempts = 0,
                locked_until = NULL,
                last_failed_login = NULL
            WHERE id = $1
            """,
            user_id,
        )

    return LoginLockoutResult(ok=True, status=200, error="")


async def ensure_not_locked(
    conn: asyncpg.Connection,
    *,
    table: LoginTable,
    user_id: uuid.UUID,
) -> LoginLockoutResult | None:
    table = _validate_table(table)
    now = _utcnow()

    row = await conn.fetchrow(
        f"""
        SELECT locked_until
        FROM {table}
        WHERE id = $1
        """,
        user_id,
    )
    if not row:
        return LoginLockoutResult(ok=False, status=401, error="Invalid credentials")

    locked_until = row["locked_until"]
    if locked_until is not None and locked_until > now:
        return LoginLockoutResult(
            ok=False,
            status=403,
            error=_locked_message(locked_until),
            code="ACCOUNT_LOCKED",
        )
    return None


async def record_login_attempt(
    conn: asyncpg.Connection,
    *,
    table: LoginTable,
    user_id: uuid.UUID,
    success: bool,
) -> LoginLockoutResult:
    table = _validate_table(table)
    now = _utcnow()

    async with conn.transaction():
        locked = await ensure_not_locked(conn, table=table, user_id=user_id)
        if locked:
            return locked

        if success:
            await conn.execute(
                f"""
                UPDATE {table}
                SET failed_login_attempts = 0,
                    locked_until = NULL,
                    last_failed_login = NULL
                WHERE id = $1
                """,
                user_id,
            )
            return LoginLockoutResult(ok=True, status=200, error="")

        row = await conn.fetchrow(
            f"""
            SELECT failed_login_attempts
            FROM {table}
            WHERE id = $1
            FOR UPDATE
            """,
            user_id,
        )
        if not row:
            return LoginLockoutResult(ok=False, status=401, error="Invalid credentials")

        attempts = int(row["failed_login_attempts"]) + 1
        new_lock = locked_until_for_attempts(attempts, now)
        await conn.execute(
            f"""
            UPDATE {table}
            SET failed_login_attempts = $2,
                locked_until = $3,
                last_failed_login = $4
            WHERE id = $1
            """,
            user_id,
            attempts,
            new_lock,
            now,
        )

    return LoginLockoutResult(ok=False, status=401, error="Invalid credentials")
