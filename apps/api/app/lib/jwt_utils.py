from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.config import settings

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


def sign_tenant_token(payload: dict[str, Any], expires_in: str = "15m") -> str:
    data = {**payload, "exp": _parse_expires(expires_in)}
    return jwt.encode(data, settings.TENANT_JWT_SECRET, algorithm="HS256")


def sign_superadmin_token(payload: dict[str, Any], expires_in: str = "15m") -> str:
    data = {**payload, "exp": _parse_expires(expires_in)}
    return jwt.encode(data, settings.SUPERADMIN_JWT_SECRET, algorithm="HS256")


def verify_tenant_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.TENANT_JWT_SECRET, algorithms=["HS256"])


def verify_superadmin_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SUPERADMIN_JWT_SECRET, algorithms=["HS256"])


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
