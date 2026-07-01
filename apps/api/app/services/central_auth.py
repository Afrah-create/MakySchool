from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("makyschool")


@dataclass(frozen=True)
class AuthTokens:
    access_token: str
    refresh_token: str | None
    user_id: str | None
    email: str | None


class CentralAuthError(Exception):
    def __init__(self, message: str, *, code: str | None = None, status: int = 401):
        super().__init__(message)
        self.code = code
        self.status = status


def central_auth_enabled() -> bool:
    return bool(settings.auth_api_base)


def _api_base() -> str:
    base = settings.auth_api_base
    if not base:
        raise RuntimeError("Central Auth is not configured")
    return base.rstrip("/")


def _supabase_url() -> str:
    return (settings.AUTH_SUPABASE_URL or settings.NEXT_PUBLIC_AUTH_SUPABASE_URL or "").rstrip("/")


def _unwrap_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    return payload


def _extract_tokens(payload: dict[str, Any]) -> AuthTokens:
    root = _unwrap_data(payload)
    tokens = root.get("tokens") if isinstance(root.get("tokens"), dict) else root

    access_token = (
        tokens.get("access_token")
        or root.get("access_token")
        or payload.get("access_token")
    )
    if not access_token or not isinstance(access_token, str):
        raise CentralAuthError("Authentication response did not include an access token.")

    refresh_token = tokens.get("refresh_token") or root.get("refresh_token")
    user = root.get("user") if isinstance(root.get("user"), dict) else {}
    user_id = (
        user.get("id")
        or user.get("user_id")
        or root.get("user_id")
        or root.get("id")
    )
    email = user.get("email") or root.get("email")
    if isinstance(email, str):
        email = email.lower().strip()

    return AuthTokens(
        access_token=access_token,
        refresh_token=refresh_token if isinstance(refresh_token, str) else None,
        user_id=str(user_id) if user_id else None,
        email=email if isinstance(email, str) else None,
    )


async def _request_json(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    url = f"{_api_base()}{path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.request(method, url, json=json_body, headers=headers)

    try:
        payload: dict[str, Any] = response.json() if response.text else {}
    except ValueError as exc:
        raise CentralAuthError(
            "Unexpected response from authentication service.",
            status=502,
        ) from exc

    if response.is_success and payload.get("success") is not False:
        return payload

    message = (
        payload.get("message")
        or payload.get("error")
        or payload.get("detail")
        or "Authentication request failed."
    )
    if isinstance(message, list):
        message = "Validation error."
    code = payload.get("error_code") or payload.get("code")
    status = response.status_code if response.status_code >= 400 else 401
    raise CentralAuthError(str(message), code=str(code) if code else None, status=status)


async def authenticate(email: str, password: str) -> AuthTokens:
    payload = await _request_json(
        "POST",
        "/auth/login",
        json_body={"email": email.strip().lower(), "password": password},
    )
    tokens = _extract_tokens(payload)
    if not tokens.user_id:
        verified = await verify_access_token(tokens.access_token)
        tokens = AuthTokens(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            user_id=verified.get("user_id") or verified.get("sub"),
            email=verified.get("email") or tokens.email,
        )
    return tokens


async def verify_access_token(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_api_base()}/auth/verify-token",
            json={"access_token": access_token},
        )

    try:
        payload: dict[str, Any] = response.json() if response.text else {}
    except ValueError as exc:
        raise CentralAuthError(
            "Unexpected response from authentication service.",
            status=502,
        ) from exc

    if payload.get("valid") is True:
        user = payload.get("user") if isinstance(payload.get("user"), dict) else payload
        user_id = user.get("id") or user.get("user_id") or payload.get("sub")
        email = user.get("email") or payload.get("email")
        return {
            "valid": True,
            "user_id": str(user_id) if user_id else None,
            "sub": str(user_id) if user_id else None,
            "email": email.lower().strip() if isinstance(email, str) else None,
        }

    error = payload.get("error") or payload.get("message") or "Invalid token."
    raise CentralAuthError(str(error), code="INVALID_TOKEN", status=401)


async def request_password_reset(email: str) -> None:
    await _request_json(
        "POST",
        "/auth/password/reset",
        json_body={"email": email.strip().lower()},
    )


async def update_password(access_token: str, new_password: str) -> None:
    await _request_json(
        "POST",
        "/auth/password/update",
        json_body={"new_password": new_password},
        headers={"Authorization": f"Bearer {access_token}"},
    )


async def provision_user(email: str, password: str) -> str:
    normalized = email.strip().lower()
    service_key = settings.AUTH_SUPABASE_SERVICE_ROLE_KEY.strip()
    supabase_url = _supabase_url()

    if service_key and supabase_url:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{supabase_url}/auth/v1/admin/users",
                headers={
                    "Authorization": f"Bearer {service_key}",
                    "apikey": service_key,
                    "Content-Type": "application/json",
                },
                json={
                    "email": normalized,
                    "password": password,
                    "email_confirm": True,
                },
            )

        try:
            payload: dict[str, Any] = response.json() if response.text else {}
        except ValueError as exc:
            raise CentralAuthError(
                "Unexpected response while creating auth user.",
                status=502,
            ) from exc

        if response.is_success:
            user_id = payload.get("id")
            if user_id:
                return str(user_id)
            raise CentralAuthError("Auth user was created without an id.", status=502)

        message = payload.get("msg") or payload.get("message") or payload.get("error_description")
        if response.status_code == 422 and "already" in str(message).lower():
            existing = await _find_supabase_user_id(normalized, service_key, supabase_url)
            if existing:
                await _update_supabase_password(existing, password, service_key, supabase_url)
                return existing
        raise CentralAuthError(
            str(message or "Failed to create auth user."),
            status=response.status_code if response.status_code >= 400 else 502,
        )

    payload = await _request_json(
        "POST",
        "/auth/signup",
        json_body={"email": normalized, "password": password, "metadata": {"product": "makyschool"}},
    )
    data = _unwrap_data(payload)
    user_id = data.get("user_id") or data.get("id")
    if not user_id and isinstance(data.get("user"), dict):
        user_id = data["user"].get("id")
    if not user_id:
        raise CentralAuthError("Signup succeeded but no user id was returned.", status=502)
    return str(user_id)


async def _find_supabase_user_id(email: str, service_key: str, supabase_url: str) -> str | None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{supabase_url}/auth/v1/admin/users",
            params={"email": email},
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
            },
        )
    if not response.is_success:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    users = payload.get("users") if isinstance(payload, dict) else None
    if isinstance(users, list) and users:
        user_id = users[0].get("id")
        return str(user_id) if user_id else None
    return None


async def _update_supabase_password(
    user_id: str,
    password: str,
    service_key: str,
    supabase_url: str,
) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.put(
            f"{supabase_url}/auth/v1/admin/users/{user_id}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "application/json",
            },
            json={"password": password},
        )
    if not response.is_success:
        try:
            payload = response.json()
            message = payload.get("msg") or payload.get("message")
        except ValueError:
            message = None
        raise CentralAuthError(
            str(message or "Failed to update auth user password."),
            status=response.status_code if response.status_code >= 400 else 502,
        )


async def sync_user_password(email: str, password: str, auth_user_id: str | None = None) -> str | None:
    """Ensure central auth password matches. Returns auth_user_id when known."""
    if not central_auth_enabled():
        return auth_user_id

    normalized = email.strip().lower()
    try:
        if auth_user_id:
            service_key = settings.AUTH_SUPABASE_SERVICE_ROLE_KEY.strip()
            supabase_url = _supabase_url()
            if service_key and supabase_url:
                await _update_supabase_password(auth_user_id, password, service_key, supabase_url)
                return auth_user_id
        return await provision_user(normalized, password)
    except CentralAuthError as exc:
        logger.warning("Central auth password sync failed for %s: %s", normalized, exc)
        raise
