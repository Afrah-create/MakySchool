import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.config import settings

ACCESS_TOKEN_EXPIRES = "20m"
REFRESH_TOKEN_EXPIRES = "8h"

ROLE_HOME = {
    "admin": "/dashboard",
    "head_teacher": "/dashboard",
    "teacher": "/teacher/dashboard",
    "bursar": "/bursar/dashboard",
    "learner": "/learner/dashboard",
}

MAKY_SCHOOL_ROLES = frozenset({"admin", "head_teacher", "teacher", "bursar", "learner"})


def _parse_expires(expires_in: str) -> datetime:
    now = datetime.now(timezone.utc)
    if expires_in.endswith("m"):
        return now + timedelta(minutes=int(expires_in[:-1]))
    if expires_in.endswith("h"):
        return now + timedelta(hours=int(expires_in[:-1]))
    if expires_in.endswith("d"):
        return now + timedelta(days=int(expires_in[:-1]))
    return now + timedelta(minutes=15)


def _token_claims(payload: dict[str, Any], expires_in: str) -> dict[str, Any]:
    return {
        **payload,
        "jti": str(uuid.uuid4()),
        "exp": _parse_expires(expires_in),
    }


def sign_tenant_token(payload: dict[str, Any], expires_in: str = ACCESS_TOKEN_EXPIRES) -> str:
    data = _token_claims(payload, expires_in)
    return jwt.encode(data, settings.TENANT_JWT_SECRET, algorithm="HS256")


def sign_superadmin_token(payload: dict[str, Any], expires_in: str = ACCESS_TOKEN_EXPIRES) -> str:
    data = _token_claims(payload, expires_in)
    return jwt.encode(data, settings.SUPERADMIN_JWT_SECRET, algorithm="HS256")


def verify_tenant_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.TENANT_JWT_SECRET, algorithms=["HS256"])


def verify_superadmin_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SUPERADMIN_JWT_SECRET, algorithms=["HS256"])


def expires_to_ms(expires_in: str) -> int:
    if expires_in.endswith("m"):
        return int(expires_in[:-1]) * 60 * 1000
    if expires_in.endswith("h"):
        return int(expires_in[:-1]) * 60 * 60 * 1000
    if expires_in.endswith("d"):
        return int(expires_in[:-1]) * 24 * 60 * 60 * 1000
    return 15 * 60 * 1000


ACCESS_TOKEN_EXPIRES_MS = expires_to_ms(ACCESS_TOKEN_EXPIRES)
REFRESH_TOKEN_EXPIRES_MS = expires_to_ms(REFRESH_TOKEN_EXPIRES)


def cookie_options(max_age_ms: int) -> dict[str, Any]:
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": settings.is_production,
        "path": "/",
        "max_age": max_age_ms // 1000,
    }


def is_maky_school_role(role: str) -> bool:
    return role in MAKY_SCHOOL_ROLES


def is_school_setup_completed(setup_completed_at: Any) -> bool:
    """Match /schools/setup/status — completed when the school has setup_completed_at."""
    return setup_completed_at is not None


def resolve_school_redirect_path(role: str, is_temp_password: bool, setup_completed: bool) -> str:
    if is_temp_password:
        return "/auth/change-password"
    if role == "admin" and not setup_completed:
        return "/dashboard/setup"
    return ROLE_HOME.get(role, "/dashboard")
