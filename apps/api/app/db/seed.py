import asyncio
import uuid

import asyncpg

from app.config import settings
from app.lib.password import hash_password


def _require_production_secrets() -> None:
    if not settings.is_production:
        return
    if (
        not settings.SUPERADMIN_JWT_SECRET
        or settings.SUPERADMIN_JWT_SECRET == "change-me-superadmin"
    ):
        raise RuntimeError("Set SUPERADMIN_JWT_SECRET before seeding in production")
    if not settings.SUPERADMIN_PASSWORD or settings.SUPERADMIN_PASSWORD == "ChangeMe123!":
        raise RuntimeError("Set SUPERADMIN_PASSWORD before seeding in production")


async def seed_super_admin() -> None:
    _require_production_secrets()

    conn = await asyncpg.connect(dsn=settings.DATABASE_URL)
    try:
        table = await conn.fetchval(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'super_admins'
            LIMIT 1
            """
        )
        if not table:
            raise RuntimeError("super_admins table not found. Run migrations first.")

        email = settings.SUPERADMIN_EMAIL.lower().strip()
        existing = await conn.fetchrow(
            "SELECT id FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
            email,
        )
        password_hash = hash_password(settings.SUPERADMIN_PASSWORD)

        if existing and not settings.SUPERADMIN_FORCE_RESET:
            print(f"Super admin already exists: {email}")
            print("Set SUPERADMIN_FORCE_RESET=true to rotate the password.")
            return

        if existing and settings.SUPERADMIN_FORCE_RESET:
            await conn.execute(
                "UPDATE super_admins SET password_hash = $1, name = $2 WHERE id = $3",
                password_hash,
                settings.SUPERADMIN_NAME,
                existing["id"],
            )
            print(f"Super admin password rotated: {email}")
            return

        await conn.execute(
            """
            INSERT INTO super_admins (id, email, password_hash, name)
            VALUES ($1, $2, $3, $4)
            """,
            uuid.uuid4(),
            email,
            password_hash,
            settings.SUPERADMIN_NAME,
        )
        print("Super admin created successfully")
        print(f"  Email:    {email}")
        if not settings.is_production:
            print(f"  Password: {settings.SUPERADMIN_PASSWORD}")
        else:
            print("  Password: (hidden — check SUPERADMIN_PASSWORD env var)")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed_super_admin())
