from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from app.lib.password import hash_password
from pydantic import BaseModel, EmailStr

from app.db.pool import get_db
from app.lib.password import validate_password
from app.middleware.auth import get_current_superadmin

router = APIRouter(dependencies=[Depends(get_current_superadmin)])

class CreateAdminBody(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None


@router.get("")
async def list_admins(conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch(
        """
        SELECT id, email, name, created_at
        FROM super_admins
        ORDER BY created_at ASC
        """
    )
    return {"data": [dict(r) for r in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_admin(
    body: CreateAdminBody,
    conn: asyncpg.Connection = Depends(get_db),
):
    if not body.name or not body.name.strip() or not body.email or not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Name, email, and password are required"},
        )

    password_error = validate_password(body.password)
    if password_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": password_error},
        )

    normalized_email = str(body.email).lower().strip()
    existing = await conn.fetchrow(
        "SELECT 1 FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
        normalized_email,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "A platform admin with this email already exists"},
        )

    admin_id = uuid.uuid4()
    password_hash = hash_password(body.password)
    await conn.execute(
        """
        INSERT INTO super_admins (id, email, password_hash, name)
        VALUES ($1, $2, $3, $4)
        """,
        admin_id,
        normalized_email,
        password_hash,
        body.name.strip(),
    )

    return {
        "data": {
            "id": str(admin_id),
            "email": normalized_email,
            "name": body.name.strip(),
        }
    }
