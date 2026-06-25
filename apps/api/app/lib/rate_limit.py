from __future__ import annotations

import logging
from typing import Any

from fastapi import Request
from jose import JWTError
from limits.strategies import STRATEGIES
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.lib.jwt_utils import verify_superadmin_token, verify_tenant_token
from app.middleware.auth import extract_superadmin_access_token, extract_tenant_access_token

logger = logging.getLogger("makyschool")

CLIENT_APP_HEADER = "x-makyschool-client-app"
TENANT_HEADER_SLUG = "x-school-slug"


def _remote_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return get_remote_address(request)


def _tenant_payload(request: Request) -> dict[str, Any] | None:
    cached = getattr(request.state, "tenant_jwt", None)
    if cached is not None:
        return cached
    token = extract_tenant_access_token(request)
    if not token:
        return None
    try:
        return verify_tenant_token(token)
    except JWTError:
        return None


def _superadmin_payload(request: Request) -> dict[str, Any] | None:
    cached = getattr(request.state, "superadmin_jwt", None)
    if cached is not None:
        return cached
    token = extract_superadmin_access_token(request)
    if not token:
        return None
    try:
        return verify_superadmin_token(token)
    except JWTError:
        return None


def get_tenant_auth_ip(request: Request) -> str:
    return f"tenant_auth:{_remote_address(request)}"


def get_superadmin_auth_ip(request: Request) -> str:
    return f"superadmin_auth:{_remote_address(request)}"


def get_login_ip_key(request: Request) -> str:
    header = (request.headers.get(CLIENT_APP_HEADER) or "").strip().lower()
    if header == "platform":
        return get_superadmin_auth_ip(request)
    return get_tenant_auth_ip(request)


def get_school_key(request: Request) -> str:
    school_id = getattr(request.state, "rate_limit_school_id", None)
    if school_id:
        return f"school:{school_id}"

    payload = _tenant_payload(request)
    if payload and payload.get("schoolId"):
        return f"school:{payload['schoolId']}"

    slug = (request.headers.get(TENANT_HEADER_SLUG) or "").strip().lower()
    if slug:
        return f"school_slug:{slug}"

    return f"ip:{_remote_address(request)}"


def get_user_key(request: Request) -> str:
    user_id = getattr(request.state, "rate_limit_user_id", None)
    if user_id:
        return f"user:{user_id}"

    payload = _tenant_payload(request)
    if payload and payload.get("sub"):
        return f"user:tenant:{payload['sub']}"

    super_payload = _superadmin_payload(request)
    if super_payload and super_payload.get("sub"):
        return f"user:superadmin:{super_payload['sub']}"

    return f"anon:{_remote_address(request)}"


def prepare_slowapi_request_state(request: Request) -> None:
    """slowapi decorators read these after the handler; initialize before routing."""
    request.state.view_rate_limit = None
    request.state._rate_limiting_complete = False


def build_limiter() -> Limiter:
    strategy = settings.RATE_LIMIT_STRATEGY
    if strategy not in STRATEGIES:
        logger.error(
            "Invalid RATE_LIMIT_STRATEGY=%r; falling back to fixed-window", strategy
        )
        strategy = "fixed-window"

    if not settings.RATE_LIMIT_ENABLED:
        logger.info("Rate limiting disabled (RATE_LIMIT_ENABLED=false)")
        return Limiter(key_func=_remote_address, enabled=False, strategy=strategy)

    redis_url = settings.REDIS_URL.strip()
    if not redis_url:
        logger.warning("Rate limiting disabled (REDIS_URL not configured)")
        return Limiter(key_func=_remote_address, enabled=False, strategy=strategy)

    try:
        import redis

        redis.from_url(redis_url, socket_connect_timeout=2).ping()
        logger.info(
            "Rate limiting enabled (strategy=%s, redis=%s, key_prefix=%s)",
            strategy,
            redis_url.split("@")[-1] if "@" in redis_url else redis_url,
            settings.RATE_LIMIT_KEY_PREFIX,
        )
    except Exception as exc:
        logger.warning(
            "Rate limiting disabled (Redis unavailable at startup): %s",
            exc,
        )
        return Limiter(key_func=_remote_address, enabled=False, strategy=strategy)

    return Limiter(
        key_func=_remote_address,
        storage_uri=redis_url,
        strategy=strategy,
        key_prefix=settings.RATE_LIMIT_KEY_PREFIX,
        swallow_errors=True,
        headers_enabled=False,
        enabled=True,
    )


limiter = build_limiter()


def is_rate_limit_exempt(path: str) -> bool:
    exempt_suffixes = (
        "/health",
        "/auth/login",
        "/auth/forgot-password",
        "/auth/reset-password",
        "/auth/refresh",
        "/superadmin/auth/login",
        "/webhooks",
    )
    if path.startswith("/uploads"):
        return True
    return any(path.endswith(suffix) or f"{suffix}/" in path for suffix in exempt_suffixes)
