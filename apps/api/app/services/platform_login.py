import uuid

import asyncpg

from app.config import settings
from app.lib.jwt_utils import (
    ACCESS_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES_MS,
    cookie_options,
    sign_superadmin_token,
)
from app.services.login_lockout import verify_login_with_lockout


def platform_app_url() -> str:
    return (getattr(settings, "PLATFORM_APP_URL", None) or "http://localhost:3001").rstrip("/")


async def is_superadmin_email(conn: asyncpg.Connection, email: str) -> bool:
    row = await conn.fetchrow(
        "SELECT id FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
        email.lower().strip(),
    )
    return row is not None


async def authenticate_superadmin(
    conn: asyncpg.Connection,
    email: str,
    password: str,
    response,
) -> dict:
    normalized = email.lower().strip()
    admin = await conn.fetchrow(
        "SELECT id, email, password_hash, name FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
        normalized,
    )
    if not admin:
        return {"ok": False, "status": 401, "error": "Invalid credentials"}

    lockout = await verify_login_with_lockout(
        conn,
        table="super_admins",
        user_id=admin["id"],
        password=password,
    )
    if not lockout.ok:
        result: dict = {"ok": False, "status": lockout.status, "error": lockout.error}
        if lockout.code:
            result["code"] = lockout.code
        return result

    payload = {
        "sub": str(admin["id"]),
        "email": admin["email"],
        "name": admin["name"],
        "role": "super_admin",
    }
    response.set_cookie(
        settings.SUPERADMIN_ACCESS_COOKIE,
        sign_superadmin_token(payload, ACCESS_TOKEN_EXPIRES),
        **cookie_options(20 * 60 * 1000),
    )
    response.set_cookie(
        settings.SUPERADMIN_REFRESH_COOKIE,
        sign_superadmin_token(payload, REFRESH_TOKEN_EXPIRES),
        **cookie_options(REFRESH_TOKEN_EXPIRES_MS),
    )
    return {
        "ok": True,
        "data": {
            "accountType": "platform",
            "role": "super_admin",
            "redirectTo": "/dashboard",
            "user": {
                "id": str(admin["id"]),
                "email": admin["email"],
                "name": admin["name"],
            },
        },
    }
