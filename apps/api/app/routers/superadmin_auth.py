from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import JWTError
from pydantic import BaseModel

from app.db.pool import get_db
from app.lib.jwt_utils import verify_superadmin_token
from app.lib.password import hash_password, validate_password, verify_password
from app.middleware.auth import (
    clear_auth_cookies,
    extract_superadmin_token,
    get_current_superadmin,
)
from app.services.platform_login import authenticate_superadmin

router = APIRouter()


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None


class ChangePasswordBody(BaseModel):
    currentPassword: str | None = None
    newPassword: str | None = None


@router.post("/login")
async def superadmin_login(
    body: LoginBody,
    response: Response,
    conn: asyncpg.Connection = Depends(get_db),
):
    if not body.email or not body.email.strip() or not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Email and password are required"},
        )

    clear_auth_cookies(response)
    result = await authenticate_superadmin(conn, body.email, body.password, response)
    if not result.get("ok"):
        raise HTTPException(
            status_code=result.get("status", 401),
            detail={"error": result.get("error", "Invalid credentials")},
        )
    return {"data": result["data"]}


@router.get("/me")
async def superadmin_me(
    request: Request,
    conn: asyncpg.Connection = Depends(get_db),
):
    token = extract_superadmin_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        )

    try:
        payload = verify_superadmin_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        ) from None

    admin = await conn.fetchrow(
        "SELECT id, email, name FROM super_admins WHERE id = $1 LIMIT 1",
        uuid.UUID(str(payload["sub"])),
    )
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        )
    return {"data": dict(admin)}


@router.post("/logout")
async def superadmin_logout(response: Response):
    clear_auth_cookies(response)
    return {"data": {"ok": True}}


@router.post("/change-password")
async def superadmin_change_password(
    body: ChangePasswordBody,
    request: Request,
    conn: asyncpg.Connection = Depends(get_db),
):
    token = extract_superadmin_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        )

    if not body.currentPassword or not body.newPassword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Current password and new password are required"},
        )

    password_error = validate_password(body.newPassword)
    if password_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": password_error},
        )

    try:
        payload = verify_superadmin_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        ) from None

    admin = await conn.fetchrow(
        "SELECT id, password_hash FROM super_admins WHERE id = $1 LIMIT 1",
        uuid.UUID(str(payload["sub"])),
    )
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        )

    if not verify_password(body.currentPassword, admin["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Current password is incorrect"},
        )

    password_hash = hash_password(body.newPassword)
    await conn.execute(
        "UPDATE super_admins SET password_hash = $1 WHERE id = $2",
        password_hash,
        admin["id"],
    )
    return {"data": {"ok": True}}
