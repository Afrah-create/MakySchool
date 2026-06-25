from fastapi import HTTPException, Request, status
from jose import JWTError

from app.config import settings
from app.lib.jwt_utils import verify_superadmin_token, verify_tenant_token


from fastapi import HTTPException, Request, status
from jose import JWTError

from app.config import settings
from app.lib.jwt_utils import verify_superadmin_token, verify_tenant_token


def _extract_bearer(auth_header: str | None) -> str | None:
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


def _verify_first_valid(tokens: list[str | None], verify) -> dict | None:
    for token in tokens:
        if not token:
            continue
        try:
            return verify(token)
        except JWTError:
            continue
    return None


def extract_tenant_access_token(request: Request) -> str | None:
    token = request.cookies.get(settings.TENANT_ACCESS_COOKIE)
    if token:
        return token
    return _extract_bearer(request.headers.get("Authorization"))


def extract_tenant_refresh_token(request: Request) -> str | None:
    return request.cookies.get(settings.TENANT_REFRESH_COOKIE)


def extract_tenant_token(request: Request) -> str | None:
    return extract_tenant_access_token(request) or extract_tenant_refresh_token(request)


def extract_superadmin_access_token(request: Request) -> str | None:
    token = request.cookies.get(settings.SUPERADMIN_ACCESS_COOKIE)
    if token:
        return token
    return _extract_bearer(request.headers.get("Authorization"))


def extract_superadmin_refresh_token(request: Request) -> str | None:
    return request.cookies.get(settings.SUPERADMIN_REFRESH_COOKIE)


def extract_superadmin_token(request: Request) -> str | None:
    return extract_superadmin_access_token(request) or extract_superadmin_refresh_token(request)


async def get_current_user(request: Request) -> dict:
    payload = _verify_first_valid(
        [extract_tenant_access_token(request), extract_tenant_refresh_token(request)],
        verify_tenant_token,
    )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )
    return payload


async def get_current_superadmin(request: Request) -> dict:
    payload = _verify_first_valid(
        [
            extract_superadmin_access_token(request),
            extract_superadmin_refresh_token(request),
        ],
        verify_superadmin_token,
    )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated", "code": "UNAUTHORIZED"},
        )
    return payload


def clear_auth_cookies(response) -> None:
    for name in (
        settings.SUPERADMIN_ACCESS_COOKIE,
        settings.SUPERADMIN_REFRESH_COOKIE,
        settings.TENANT_ACCESS_COOKIE,
        settings.TENANT_REFRESH_COOKIE,
    ):
        response.delete_cookie(name, path="/")
