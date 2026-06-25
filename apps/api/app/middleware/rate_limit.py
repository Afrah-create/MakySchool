from __future__ import annotations

import logging

from fastapi import Request
from limits import parse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.lib.rate_limit import (
    get_user_key,
    is_rate_limit_exempt,
    limiter,
    prepare_slowapi_request_state,
)

logger = logging.getLogger("makyschool")

RATE_LIMITED_BODY = {
    "error": "Too many requests. Please try again in a moment.",
    "code": "RATE_LIMITED",
}


class RateLimitContextMiddleware(BaseHTTPMiddleware):
    """Populate request.state with JWT claims for rate-limit key functions (no DB)."""

    async def dispatch(self, request: Request, call_next):
        prepare_slowapi_request_state(request)
        from app.lib.rate_limit import _superadmin_payload, _tenant_payload

        request.state.tenant_jwt = _tenant_payload(request)
        request.state.superadmin_jwt = _superadmin_payload(request)

        tenant = request.state.tenant_jwt
        if tenant:
            request.state.rate_limit_user_id = tenant.get("sub")
            request.state.rate_limit_school_id = tenant.get("schoolId")
        else:
            superadmin = request.state.superadmin_jwt
            if superadmin:
                request.state.rate_limit_user_id = f"superadmin:{superadmin.get('sub')}"
            request.state.rate_limit_school_id = None

        return await call_next(request)


class DefaultAuthenticatedRateLimitMiddleware(BaseHTTPMiddleware):
    """Catch-all authenticated limits: GET 200/min, mutations 60/min per user."""

    async def dispatch(self, request: Request, call_next):
        if not limiter.enabled:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if is_rate_limit_exempt(path):
            return await call_next(request)

        user_key = get_user_key(request)
        if user_key.startswith("anon:"):
            return await call_next(request)

        if request.method == "GET":
            limit_string = "200/minute"
        elif request.method in ("POST", "PATCH", "PUT", "DELETE"):
            limit_string = "60/minute"
        else:
            return await call_next(request)

        scope = "default_get" if request.method == "GET" else "default_write"
        if not self._hit(limit_string, user_key, scope):
            return JSONResponse(status_code=429, content=RATE_LIMITED_BODY)

        return await call_next(request)

    def _hit(self, limit_string: str, user_key: str, scope: str) -> bool:
        try:
            limit_item = parse(limit_string)
            return limiter.limiter.hit(limit_item, user_key, scope)
        except Exception as exc:
            logger.warning("Default rate limit check failed, allowing request: %s", exc)
            return True
