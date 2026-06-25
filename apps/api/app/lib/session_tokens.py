from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from jose import JWTError

from app.config import settings
from app.lib.jwt_utils import (
    ACCESS_TOKEN_EXPIRES,
    cookie_options,
    sign_superadmin_token,
    sign_tenant_token,
    verify_superadmin_token,
    verify_tenant_token,
)

VerifyFn = Callable[[str], dict[str, Any]]
SignFn = Callable[[dict[str, Any], str], str]


def access_expires_at_unix() -> int:
    from app.lib.jwt_utils import _parse_expires

    return int(_parse_expires(ACCESS_TOKEN_EXPIRES).timestamp())


def issue_tenant_access_cookie(response, payload: dict[str, Any]) -> int:
    response.set_cookie(
        settings.TENANT_ACCESS_COOKIE,
        sign_tenant_token(payload, ACCESS_TOKEN_EXPIRES),
        **cookie_options(ACCESS_TOKEN_EXPIRES_MS),
    )
    return access_expires_at_unix()


def issue_superadmin_access_cookie(response, payload: dict[str, Any]) -> int:
    response.set_cookie(
        settings.SUPERADMIN_ACCESS_COOKIE,
        sign_superadmin_token(payload, ACCESS_TOKEN_EXPIRES),
        **cookie_options(ACCESS_TOKEN_EXPIRES_MS),
    )
    return access_expires_at_unix()


ACCESS_TOKEN_EXPIRES_MS = 20 * 60 * 1000


def _payload_without_exp(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in {"exp", "iat", "jti"}}


def _verify_token(token: str | None, verify: VerifyFn) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        return verify(token)
    except JWTError:
        return None


def refresh_tenant_session(request, response) -> dict[str, Any] | None:
    refresh_token = request.cookies.get(settings.TENANT_REFRESH_COOKIE)
    access_token = request.cookies.get(settings.TENANT_ACCESS_COOKIE)
    payload = _verify_token(refresh_token, verify_tenant_token) or _verify_token(
        access_token, verify_tenant_token
    )
    if not payload:
        return None
    expires_at = issue_tenant_access_cookie(response, _payload_without_exp(payload))
    return {"valid": True, "expiresAt": expires_at}


def refresh_superadmin_session(request, response) -> dict[str, Any] | None:
    refresh_token = request.cookies.get(settings.SUPERADMIN_REFRESH_COOKIE)
    access_token = request.cookies.get(settings.SUPERADMIN_ACCESS_COOKIE)
    payload = _verify_token(refresh_token, verify_superadmin_token) or _verify_token(
        access_token, verify_superadmin_token
    )
    if not payload:
        return None
    expires_at = issue_superadmin_access_cookie(response, _payload_without_exp(payload))
    return {"valid": True, "expiresAt": expires_at}


def resolve_tenant_session(request) -> tuple[dict[str, Any] | None, int | None]:
    access_token = request.cookies.get(settings.TENANT_ACCESS_COOKIE)
    refresh_token = request.cookies.get(settings.TENANT_REFRESH_COOKIE)
    payload = _verify_token(access_token, verify_tenant_token) or _verify_token(
        refresh_token, verify_tenant_token
    )
    if not payload:
        return None, None
    exp = payload.get("exp")
    if isinstance(exp, datetime):
        return payload, int(exp.timestamp())
    if isinstance(exp, (int, float)):
        return payload, int(exp)
    return payload, None


def resolve_superadmin_session(request) -> tuple[dict[str, Any] | None, int | None]:
    access_token = request.cookies.get(settings.SUPERADMIN_ACCESS_COOKIE)
    refresh_token = request.cookies.get(settings.SUPERADMIN_REFRESH_COOKIE)
    payload = _verify_token(access_token, verify_superadmin_token) or _verify_token(
        refresh_token, verify_superadmin_token
    )
    if not payload:
        return None, None
    exp = payload.get("exp")
    if isinstance(exp, datetime):
        return payload, int(exp.timestamp())
    if isinstance(exp, (int, float)):
        return payload, int(exp)
    return payload, None
