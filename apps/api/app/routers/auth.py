import asyncio
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.db.pool import get_db
from app.lib.email import send_password_reset_email
from app.lib.jwt_utils import (
    ACCESS_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES,
    cookie_options,
    is_maky_school_role,
    is_school_setup_completed,
    resolve_school_redirect_path,
    sign_tenant_token,
)
from app.lib.session_tokens import (
    refresh_superadmin_session,
    refresh_tenant_session,
    resolve_superadmin_session,
    resolve_tenant_session,
)
from app.lib.password import hash_password, validate_password, verify_password
from app.lib.user_sql import USER_DISPLAY_NAME_SQL, normalize_user_role
from app.middleware.auth import (
    clear_auth_cookies,
    get_current_user,
)
from app.services.platform_login import authenticate_superadmin, is_superadmin_email
from app.services.subscription import audit_school_subscription

router = APIRouter()
change_password_router = APIRouter()
forgot_password_router = APIRouter()
reset_password_router = APIRouter()
school_preview_router = APIRouter()

CLIENT_APP_HEADER = "x-makyschool-client-app"
TENANT_HEADER_SLUG = "x-school-slug"


class LoginBody(BaseModel):
    email: str
    password: str
    schoolSlug: str | None = None


def _resolve_client_app(request: Request) -> str:
    header = (request.headers.get(CLIENT_APP_HEADER) or "").strip().lower()
    return "platform" if header == "platform" else "tenant"


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/login")
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    conn: asyncpg.Connection = Depends(get_db),
):
    if not body.email.strip() or not body.password:
        return Response(
            content='{"error":"Email and password are required"}',
            status_code=400,
            media_type="application/json",
        )

    normalized_email = body.email.lower().strip()
    header_slug = (request.headers.get(TENANT_HEADER_SLUG) or "").strip().lower()
    requested_slug = (body.schoolSlug or header_slug or "").strip().lower() or None

    clear_auth_cookies(response)

    if _resolve_client_app(request) == "platform":
        result = await authenticate_superadmin(conn, normalized_email, body.password, response)
        if not result["ok"]:
            return Response(
                content=f'{{"error":"{result["error"]}"}}',
                status_code=result["status"],
                media_type="application/json",
            )
        return {"data": result["data"]}

    if await is_superadmin_email(conn, normalized_email):
        return Response(
            content='{"error":"Invalid credentials"}',
            status_code=401,
            media_type="application/json",
        )

    candidates = await conn.fetch(
        f"""
        SELECT u.id, u.email, u.password_hash,
               {USER_DISPLAY_NAME_SQL} AS name,
               u.role, u.school_id, u.account_status,
               COALESCE(u.is_active, u.account_status = 'ACTIVE' OR u.account_status IS NULL) AS is_active,
               COALESCE(u.is_temp_password, false) AS is_temp_password,
               s.setup_completed_at,
               s.slug AS school_slug, s.name AS school_name,
               s.status AS school_status, s.subscription_status
        FROM users u
        INNER JOIN schools s ON s.id = u.school_id
        WHERE LOWER(u.email) = LOWER($1) AND u.password_hash IS NOT NULL
        ORDER BY s.name ASC
        """,
        normalized_email,
    )

    if not candidates:
        return Response(
            content='{"error":"Invalid credentials"}',
            status_code=401,
            media_type="application/json",
        )

    candidate = candidates[0]
    if len(candidates) > 1:
        if not requested_slug:
            return Response(
                content='{"error":"Multiple schools found for this email. Enter your school slug to continue.","code":"SCHOOL_SLUG_REQUIRED"}',
                status_code=400,
                media_type="application/json",
            )
        matched = next((r for r in candidates if r["school_slug"] == requested_slug), None)
        if not matched:
            return Response(
                content='{"error":"Invalid credentials"}',
                status_code=401,
                media_type="application/json",
            )
        candidate = matched
    elif requested_slug and candidate["school_slug"] != requested_slug:
        return Response(
            content='{"error":"Invalid credentials"}',
            status_code=401,
            media_type="application/json",
        )

    if not candidate["is_active"]:
        await asyncio.sleep(0.2)
        return Response(
            content='{"error":"Your account has been deactivated. Contact your school administrator.","code":"ACCOUNT_DEACTIVATED"}',
            status_code=403,
            media_type="application/json",
        )

    if not verify_password(body.password, candidate["password_hash"]):
        return Response(
            content='{"error":"Invalid credentials"}',
            status_code=401,
            media_type="application/json",
        )

    normalized_role = normalize_user_role(candidate["role"])
    if _resolve_client_app(request) == "tenant" and not is_maky_school_role(normalized_role):
        return Response(
            content='{"error":"Account not valid for this portal"}',
            status_code=403,
            media_type="application/json",
        )

    if candidate["account_status"] and candidate["account_status"] != "ACTIVE":
        return Response(
            content='{"error":"Your account has been deactivated. Contact your school administrator.","code":"ACCOUNT_INACTIVE"}',
            status_code=403,
            media_type="application/json",
        )

    if candidate["school_status"] == "suspended":
        return Response(
            content='{"error":"This school account is suspended. Contact MakySchool support.","code":"SCHOOL_SUSPENDED"}',
            status_code=403,
            media_type="application/json",
        )

    await audit_school_subscription(conn, candidate["school_id"])

    refreshed = await conn.fetchrow(
        "SELECT subscription_status, subscription_term, subscription_year FROM schools WHERE id = $1",
        candidate["school_id"],
    )

    is_temp = bool(candidate["is_temp_password"])
    setup_completed = is_school_setup_completed(candidate["setup_completed_at"])

    payload = {
        "sub": str(candidate["id"]),
        "email": candidate["email"],
        "name": candidate["name"],
        "role": normalized_role,
        "schoolId": str(candidate["school_id"]),
        "schoolSlug": candidate["school_slug"],
        "mustChangePassword": is_temp,
        "setupCompleted": setup_completed,
    }

    if is_temp:
        response.set_cookie(
            settings.TENANT_ACCESS_COOKIE,
            sign_tenant_token(payload, "1h"),
            **cookie_options(60 * 60 * 1000),
        )
        response.delete_cookie(settings.TENANT_REFRESH_COOKIE, path="/")
    else:
        response.set_cookie(
            settings.TENANT_ACCESS_COOKIE,
            sign_tenant_token(payload, ACCESS_TOKEN_EXPIRES),
            **cookie_options(20 * 60 * 1000),
        )
        response.set_cookie(
            settings.TENANT_REFRESH_COOKIE,
            sign_tenant_token(payload, REFRESH_TOKEN_EXPIRES),
            **cookie_options(7 * 24 * 60 * 60 * 1000),
        )

    redirect_to = resolve_school_redirect_path(normalized_role, is_temp, setup_completed)
    school = {
        "id": str(candidate["school_id"]),
        "slug": candidate["school_slug"],
        "name": candidate["school_name"],
        "status": candidate["school_status"],
        "subscription_status": refreshed["subscription_status"] if refreshed else candidate["subscription_status"],
    }

    return {
        "data": {
            "accountType": "school",
            "role": normalized_role,
            "redirectTo": redirect_to,
            "redirect": redirect_to,
            "user": {
                "id": str(candidate["id"]),
                "email": candidate["email"],
                "name": candidate["name"],
                "role": normalized_role,
                "school_id": str(candidate["school_id"]),
            },
            "school": school,
        }
    }


@router.get("/me")
async def me(
    request: Request,
    conn: asyncpg.Connection = Depends(get_db),
    session_only: bool = Query(False, alias="sessionOnly"),
):
    client_app = _resolve_client_app(request)

    if client_app == "platform":
        payload, expires_at = resolve_superadmin_session(request)
        if not payload:
            return Response(
                content='{"error":"Not authenticated"}',
                status_code=401,
                media_type="application/json",
            )
        if session_only:
            return {"data": {"valid": True, "expiresAt": expires_at}}

        admin = await conn.fetchrow(
            "SELECT id, email, name FROM super_admins WHERE id = $1 LIMIT 1",
            uuid.UUID(str(payload["sub"])),
        )
        if not admin:
            return Response(
                content='{"error":"Not authenticated"}',
                status_code=401,
                media_type="application/json",
            )
        return {
            "data": {
                "accountType": "platform",
                "role": "super_admin",
                "user": dict(admin),
                "session": {"valid": True, "expiresAt": expires_at},
            }
        }

    payload, expires_at = resolve_tenant_session(request)
    if not payload:
        return Response(
            content='{"error":"Not authenticated"}',
            status_code=401,
            media_type="application/json",
        )

    if session_only:
        return {"data": {"valid": True, "expiresAt": expires_at}}

    try:
        header_slug = request.headers.get(TENANT_HEADER_SLUG)
        if header_slug and payload.get("schoolSlug") != header_slug:
            return Response(
                content='{"error":"Forbidden"}',
                status_code=403,
                media_type="application/json",
            )

        user = await conn.fetchrow(
            f"""
            SELECT u.id, u.email, {USER_DISPLAY_NAME_SQL} AS name, u.role, u.school_id
            FROM users u WHERE u.id = $1 LIMIT 1
            """,
            uuid.UUID(str(payload["sub"])),
        )
        if not user:
            return Response(
                content='{"error":"Not authenticated"}',
                status_code=401,
                media_type="application/json",
            )

        role = normalize_user_role(user["role"])
        return {
            "data": {
                "accountType": "school",
                "role": role,
                "user": {**dict(user), "role": role},
                "school": {"slug": payload.get("schoolSlug"), "id": payload.get("schoolId")},
                "session": {"valid": True, "expiresAt": expires_at},
            }
        }
    except Exception:
        return Response(
            content='{"error":"Not authenticated"}',
            status_code=401,
            media_type="application/json",
        )


@router.post("/refresh")
async def refresh_session(request: Request, response: Response):
    client_app = _resolve_client_app(request)
    if client_app == "platform":
        session = refresh_superadmin_session(request, response)
    else:
        session = refresh_tenant_session(request, response)

    if not session:
        return Response(
            content='{"error":"Not authenticated","code":"UNAUTHORIZED"}',
            status_code=401,
            media_type="application/json",
        )

    return {"data": session}


@router.post("/logout")
async def logout(request: Request, response: Response):
    # Future: read jti from cookies and add to a denylist for server-side revocation.
    clear_auth_cookies(response)
    return {"data": {"ok": True}}


class ChangePasswordBody(BaseModel):
    currentPassword: str
    newPassword: str


@change_password_router.post("")
async def change_password(
    body: ChangePasswordBody,
    response: Response,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    err = validate_password(body.newPassword)
    if err:
        return Response(content=f'{{"error":"{err}"}}', status_code=400, media_type="application/json")

    user = await conn.fetchrow(
        f"""
        SELECT u.id, u.email, {USER_DISPLAY_NAME_SQL} AS name, u.role, u.school_id,
               u.password_hash, s.setup_completed_at, s.slug AS school_slug
        FROM users u INNER JOIN schools s ON s.id = u.school_id
        WHERE u.id = $1 LIMIT 1
        """,
        uuid.UUID(str(current_user["sub"])),
    )
    if not user:
        return Response(content='{"error":"User not found"}', status_code=404, media_type="application/json")

    if not verify_password(body.currentPassword, user["password_hash"]):
        return Response(
            content='{"error":"Current password is incorrect"}',
            status_code=401,
            media_type="application/json",
        )

    password_hash = hash_password(body.newPassword)
    await conn.execute(
        "UPDATE users SET password_hash = $1, is_temp_password = false, updated_at = NOW() WHERE id = $2",
        password_hash,
        user["id"],
    )

    role = normalize_user_role(user["role"])
    setup_completed = is_school_setup_completed(user["setup_completed_at"])
    redirect = "/dashboard" if setup_completed else "/dashboard/setup"
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": role,
        "schoolId": str(user["school_id"]),
        "schoolSlug": user["school_slug"],
        "mustChangePassword": False,
        "setupCompleted": setup_completed,
    }
    response.set_cookie(
        settings.TENANT_ACCESS_COOKIE,
        sign_tenant_token(payload, ACCESS_TOKEN_EXPIRES),
        **cookie_options(20 * 60 * 1000),
    )
    response.set_cookie(
        settings.TENANT_REFRESH_COOKIE,
        sign_tenant_token(payload, REFRESH_TOKEN_EXPIRES),
        **cookie_options(7 * 24 * 60 * 60 * 1000),
    )
    return {"data": {"redirect": redirect, "schoolSlug": user["school_slug"]}}


class ForgotPasswordBody(BaseModel):
    email: EmailStr


@forgot_password_router.post("")
async def forgot_password(body: ForgotPasswordBody, conn: asyncpg.Connection = Depends(get_db)):
    normalized = body.email.lower().strip()
    raw_token = secrets.token_hex(32)
    hashed = _hash_reset_token(raw_token)

    row = await conn.fetchrow(
        """
        SELECT id FROM users
        WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL AND password_hash IS NOT NULL
        LIMIT 1
        """,
        normalized,
    )
    if row:
        await conn.execute(
            """
            UPDATE users SET password_reset_token = $1,
            password_reset_expires = NOW() + interval '1 hour', updated_at = NOW()
            WHERE id = $2
            """,
            hashed,
            row["id"],
        )
        app_url = settings.NEXT_PUBLIC_APP_URL.rstrip("/")
        reset_link = f"{app_url}/auth/reset-password?token={raw_token}&email={normalized}"
        await send_password_reset_email(to=normalized, reset_url=reset_link)

    return {"data": {"ok": True, "message": "If an account exists, a reset link has been sent."}}


class ResetPasswordBody(BaseModel):
    email: EmailStr
    token: str
    new_password: str


@reset_password_router.post("")
async def reset_password(body: ResetPasswordBody, conn: asyncpg.Connection = Depends(get_db)):
    err = validate_password(body.new_password)
    if err:
        return Response(content=f'{{"error":"{err}"}}', status_code=400, media_type="application/json")

    normalized = body.email.lower().strip()
    hashed = _hash_reset_token(body.token.strip())

    user = await conn.fetchrow(
        """
        SELECT id, password_reset_token, password_reset_expires FROM users
        WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL LIMIT 1
        """,
        normalized,
    )
    if not user or not user["password_reset_token"] or not user["password_reset_expires"]:
        return Response(
            content='{"error":"Invalid or expired reset link"}',
            status_code=400,
            media_type="application/json",
        )
    if user["password_reset_expires"] < datetime.now(timezone.utc):
        return Response(
            content='{"error":"Invalid or expired reset link"}',
            status_code=400,
            media_type="application/json",
        )
    if user["password_reset_token"] != hashed:
        return Response(
            content='{"error":"Invalid or expired reset link"}',
            status_code=400,
            media_type="application/json",
        )

    password_hash = hash_password(body.new_password)
    await conn.execute(
        """
        UPDATE users SET password_hash = $1, is_temp_password = false,
        password_reset_token = NULL, password_reset_expires = NULL,
        password_changed_at = NOW(), updated_at = NOW()
        WHERE id = $2
        """,
        password_hash,
        user["id"],
    )
    return {"data": {"ok": True}}


@school_preview_router.get("/{slug}")
async def school_preview(slug: str, conn: asyncpg.Connection = Depends(get_db)):
    normalized = slug.strip().lower()
    if not normalized:
        return Response(
            content='{"error":"School slug is required"}',
            status_code=400,
            media_type="application/json",
        )
    row = await conn.fetchrow(
        "SELECT name, logo_url, slug, school_type FROM schools WHERE slug = $1 LIMIT 1",
        normalized,
    )
    if not row:
        return Response(
            content='{"error":"School not found"}',
            status_code=404,
            media_type="application/json",
        )
    return {"data": dict(row)}
