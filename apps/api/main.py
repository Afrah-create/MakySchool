import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.db.migrate import run_migrations_on_startup
from app.db.pool import close_pool, get_pool
from app.lib.cors import is_origin_allowed
from app.middleware.errors import add_exception_handlers
from app.middleware.request_id import RequestIDMiddleware
from app.routers import (
    auth,
    billing,
    classes,
    fees,
    health,
    setup,
    students,
    subjects,
    superadmin_admins,
    superadmin_auth,
    superadmin_schools,
    superadmin_settings,
    superadmin_subscriptions,
    teachers,
    users,
    webhooks,
)

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
)
logger = logging.getLogger("makyschool")


def mount_v1_and_legacy(app: FastAPI, router, legacy_prefix: str) -> None:
    app.include_router(router, prefix=legacy_prefix)
    if legacy_prefix.startswith("/api/"):
        v1_prefix = "/api/v1" + legacy_prefix[4:]
    elif legacy_prefix == "/api":
        v1_prefix = "/api/v1"
    else:
        v1_prefix = f"/api/v1{legacy_prefix}"
    app.include_router(router, prefix=v1_prefix)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations_on_startup()
    await get_pool()
    logger.info("MakySchool API started")
    yield
    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(
        title="MakySchool API",
        version="2.0.0",
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url=None,
        lifespan=lifespan,
        redirect_slashes=False,
    )

    add_exception_handlers(app)

    origins = settings.cors_origins

    if origins:

        class DynamicCORSMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request: Request, call_next):
                origin = request.headers.get("origin")
                if request.method == "OPTIONS" and origin and is_origin_allowed(origin):
                    response = await call_next(request)
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                    return response
                return await call_next(request)

        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
            allow_headers=[
                "Content-Type",
                "Authorization",
                "x-school-slug",
                "x-school-id",
                "x-makyschool-client-app",
            ],
        )
        app.add_middleware(DynamicCORSMiddleware)
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=".*",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    if settings.is_production:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*.makylegacy.com", "makylegacy.com", "localhost"],
        )

    app.add_middleware(RequestIDMiddleware)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    mount_v1_and_legacy(app, health.router, "/api")
    mount_v1_and_legacy(app, auth.router, "/api/auth")
    mount_v1_and_legacy(app, auth.change_password_router, "/api/auth/change-password")
    mount_v1_and_legacy(app, auth.forgot_password_router, "/api/auth/forgot-password")
    mount_v1_and_legacy(app, auth.reset_password_router, "/api/auth/reset-password")
    mount_v1_and_legacy(app, auth.school_preview_router, "/api/auth/school")

    mount_v1_and_legacy(app, superadmin_auth.router, "/api/superadmin/auth")
    mount_v1_and_legacy(app, superadmin_schools.router, "/api/superadmin/schools")
    mount_v1_and_legacy(app, superadmin_admins.router, "/api/superadmin/admins")
    mount_v1_and_legacy(app, superadmin_settings.router, "/api/superadmin/settings")
    mount_v1_and_legacy(app, superadmin_subscriptions.router, "/api/superadmin/subscriptions")

    mount_v1_and_legacy(app, setup.router, "/api/schools/setup")
    mount_v1_and_legacy(app, classes.router, "/api/schools/classes")
    mount_v1_and_legacy(app, subjects.router, "/api/schools/subjects")
    mount_v1_and_legacy(app, users.router, "/api/schools/users")
    mount_v1_and_legacy(app, teachers.router, "/api/schools/teachers")
    mount_v1_and_legacy(app, students.router, "/api/schools/students")
    mount_v1_and_legacy(app, fees.router, "/api/schools/fees")
    mount_v1_and_legacy(app, billing.router, "/api/schools/billing")

    mount_v1_and_legacy(app, webhooks.router, "/api/webhooks")

    return app


app = create_app()
