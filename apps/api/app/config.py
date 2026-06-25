from pathlib import Path
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

RateLimitStrategy = Literal["fixed-window", "moving-window", "sliding-window-counter"]

_REPO_ROOT = Path(__file__).resolve().parents[3]
_API_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    DATABASE_URL: str

    TENANT_JWT_SECRET: str = "dev-tenant-secret"
    SUPERADMIN_JWT_SECRET: str = "dev-superadmin-secret"

    TENANT_ACCESS_COOKIE: str = "tenant_access_token"
    TENANT_REFRESH_COOKIE: str = "tenant_refresh_token"
    SUPERADMIN_ACCESS_COOKIE: str = "superadmin_access_token"
    SUPERADMIN_REFRESH_COOKIE: str = "superadmin_refresh_token"

    PORT: int = 4000
    ENVIRONMENT: str = "development"
    NODE_ENV: str = "development"

    CORS_ORIGIN: str = ""
    CORS_ALLOW_VERCEL_PREVIEWS: bool = False

    UPLOAD_DIR: str = str(_API_ROOT / "uploads")
    MAX_UPLOAD_SIZE_MB: int = 2

    SUPERADMIN_EMAIL: str = "admin@makyschool.com"
    SUPERADMIN_PASSWORD: str = "ChangeMe123!"
    SUPERADMIN_NAME: str = "Platform Admin"
    SUPERADMIN_FORCE_RESET: bool = False

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "MakySchool <noreply@makylegacy.com>"

    SCHOOLPAY_WEBHOOK_SECRET: str = ""
    MAKYWIRE_API_BASE_URL: str = "https://wire-api.makylegacy.com/api/v1"
    MAKYWIRE_API_KEY: str = ""
    MAKYWIRE_API_SECRET: str = ""
    MAKYWIRE_AUTH_BASIC: str = ""
    MAKYWIRE_CALLBACK_URL: str = ""
    MAKYWIRE_WEBHOOK_SECRET: str = ""

    MAKYREACH_API_KEY: str = ""
    MAKYREACH_API_URL: str = ""

    SUBSCRIPTIONS_ENABLED: bool = False
    NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED: bool = False
    PLATFORM_APP_URL: str = "http://localhost:3001"
    NEXT_PUBLIC_APP_URL: str = "http://localhost:8080"
    RUN_MIGRATIONS: bool = True

    REDIS_URL: str = ""
    RATE_LIMIT_ENABLED: bool = True
    # fixed-window: count per calendar window (e.g. per minute). Default; works well with Redis.
    # moving-window: rolling window; smoother limits, higher Redis memory use.
    # sliding-window-counter: approximates sliding window with two fixed windows.
    RATE_LIMIT_STRATEGY: RateLimitStrategy = "fixed-window"
    RATE_LIMIT_KEY_PREFIX: str = "makyschool:rl"

    @property
    def cors_origins(self) -> List[str]:
        if not self.CORS_ORIGIN.strip():
            return []
        return [o.strip() for o in self.CORS_ORIGIN.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production" or self.NODE_ENV == "production"


settings = Settings()
