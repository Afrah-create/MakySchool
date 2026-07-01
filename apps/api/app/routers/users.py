import secrets
import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.password import hash_password
from app.lib.permissions import can
from app.lib.teacher_assignments import (
    AssignmentInput,
    scaffold_term_submissions,
    sync_teacher_assignments,
)
from app.lib.user_sql import USER_DISPLAY_NAME_SQL, normalize_user_role
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.central_auth import CentralAuthError, central_auth_enabled, sync_user_password

router = APIRouter()

CREATABLE_ROLES = frozenset({"head_teacher", "teacher", "bursar", "learner"})
ASSIGNABLE_ROLES = frozenset({"head_teacher", "teacher"})

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class AssignmentBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID | None = None


class CreateUserBody(BaseModel):
    full_name: str
    email: str
    role: str
    phone: str | None = None
    subject_specialization: str | None = None
    class_ids: list[uuid.UUID] = Field(default_factory=list)
    subject_ids: list[uuid.UUID] = Field(default_factory=list)
    assignments: list[AssignmentBody] = Field(default_factory=list)


class UpdateUserBody(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    subject_specialization: str | None = None
    role: str | None = None
    class_ids: list[uuid.UUID] | None = None
    subject_ids: list[uuid.UUID] | None = None
    assignments: list[AssignmentBody] | None = None


class DeactivateBody(BaseModel):
    reason: str | None = None


def _parse_assignments(body: CreateUserBody | UpdateUserBody) -> list[AssignmentInput]:
    if body.assignments:
        return [
            AssignmentInput(class_id=a.class_id, subject_id=a.subject_id)
            for a in body.assignments
        ]

    class_ids = body.class_ids or []
    subject_ids = body.subject_ids or []

    if not subject_ids:
        return [AssignmentInput(class_id=cid) for cid in class_ids]

    return [
        AssignmentInput(class_id=class_id, subject_id=subject_id)
        for class_id in class_ids
        for subject_id in subject_ids
    ]


def _serialize_row(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    for key, value in data.items():
        if isinstance(value, uuid.UUID):
            data[key] = str(value)
    return data


async def _fetch_assignments_for_users(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_ids: list[uuid.UUID],
) -> dict[str, list[dict[str, Any]]]:
    if not user_ids:
        return {}

    rows = await conn.fetch(
        """
        SELECT
          tca.teacher_id,
          tca.class_id,
          tca.subject_id,
          c.level,
          c.stream,
          s.name AS subject_name
        FROM teacher_class_assignments tca
        JOIN school_classes c ON c.id = tca.class_id
        LEFT JOIN school_subjects s ON s.id = tca.subject_id
        WHERE tca.school_id = $1
          AND tca.teacher_id = ANY($2::uuid[])
        ORDER BY c.level, c.stream, s.name
        """,
        school_id,
        user_ids,
    )

    result: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        teacher_id = str(row["teacher_id"])
        entry = {
            "class_id": str(row["class_id"]),
            "subject_id": str(row["subject_id"]) if row["subject_id"] else None,
            "class_name": row["level"],
            "stream": row["stream"],
            "subject_name": row["subject_name"],
        }
        result.setdefault(teacher_id, []).append(entry)
    return result


async def _replace_teacher_assignments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    assigned_by: uuid.UUID,
    assignments: list[AssignmentInput],
) -> None:
    result = await sync_teacher_assignments(
        conn,
        school_id,
        teacher_id,
        assigned_by,
        assignments,
        acknowledge_warnings=True,
    )
    if not result["ok"]:
        message = (
            result.get("fields", {}).get("assignments", result["error"])
            if result.get("code") == "ASSIGNMENT_LOCKED"
            else result["error"]
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": message})

    preview = result["preview"]
    to_add = [
        AssignmentInput(
            class_id=uuid.UUID(item["class_id"]),
            subject_id=uuid.UUID(item["subject_id"]) if item.get("subject_id") else None,
        )
        for item in preview["to_add"]
    ]
    if to_add:
        await scaffold_term_submissions(conn, school_id, teacher_id, to_add)


@router.get("")
async def list_users(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    role: str | None = Query(None),
    is_active: str | None = Query(None),
    search: str | None = Query(None),
):
    school_id, _user = ctx

    conditions = ["u.school_id = $1"]
    params: list[Any] = [school_id]
    param_index = 2

    if role:
        conditions.append(f"LOWER(u.role) = LOWER(${param_index})")
        params.append(role)
        param_index += 1

    if is_active in ("true", "false"):
        conditions.append(f"COALESCE(u.is_active, true) = ${param_index}")
        params.append(is_active == "true")
        param_index += 1

    if search and search.strip():
        conditions.append(
            f"(LOWER({USER_DISPLAY_NAME_SQL}) LIKE LOWER(${param_index}) "
            f"OR LOWER(u.email) LIKE LOWER(${param_index}))"
        )
        params.append(f"%{search.strip()}%")
        param_index += 1

    rows = await conn.fetch(
        f"""
        SELECT
          u.id,
          u.email,
          {USER_DISPLAY_NAME_SQL} AS full_name,
          u.role,
          u.phone,
          u.subject_specialization,
          COALESCE(u.is_active, true) AS is_active,
          u.deactivated_at,
          u.deactivated_reason,
          u.created_at
        FROM users u
        WHERE {" AND ".join(conditions)}
        ORDER BY {USER_DISPLAY_NAME_SQL} ASC
        """,
        *params,
    )

    teacher_ids = [
        row["id"]
        for row in rows
        if normalize_user_role(row["role"]) in ASSIGNABLE_ROLES
    ]
    assignment_map = await _fetch_assignments_for_users(conn, school_id, teacher_ids)

    data = []
    for row in rows:
        item = _serialize_row(row)
        item["role"] = normalize_user_role(row["role"])
        item["assigned_classes"] = assignment_map.get(str(row["id"]), [])
        data.append(item)

    return {"data": data}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    full_name = body.full_name.strip()
    email = body.email.strip()
    role = body.role.strip().lower()

    if not full_name or not email or not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Full name, email, and role are required"},
        )

    if role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Cannot create admin accounts"},
        )

    if role not in CREATABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "Invalid role"})

    normalized_email = email.lower()
    existing = await conn.fetchval(
        "SELECT 1 FROM users WHERE school_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1",
        school_id,
        normalized_email,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "Email is already in use at this school"},
        )

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)
    user_id = uuid.uuid4()
    actor_id = uuid.UUID(str(actor["sub"]))
    auth_user_id: uuid.UUID | None = None

    if central_auth_enabled():
        try:
            linked = await sync_user_password(normalized_email, temp_password)
            if linked:
                auth_user_id = uuid.UUID(linked)
        except CentralAuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": str(exc), "code": exc.code or "AUTH_SERVICE_ERROR"},
            ) from exc

    parsed_assignments = _parse_assignments(body)

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO users (
              id, school_id, email, password_hash, full_name, name, role,
              phone, subject_specialization, is_temp_password, is_active,
              account_status, created_by, auth_user_id
            ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, true, true, 'ACTIVE', $9, $10)
            """,
            user_id,
            school_id,
            normalized_email,
            password_hash,
            full_name,
            role,
            body.phone.strip() if body.phone else None,
            body.subject_specialization.strip() if body.subject_specialization else None,
            actor_id,
            auth_user_id,
        )

        if role in ASSIGNABLE_ROLES and parsed_assignments:
            await _replace_teacher_assignments(
                conn, school_id, user_id, actor_id, parsed_assignments
            )

    return {
        "data": {
            "user": {
                "id": str(user_id),
                "full_name": full_name,
                "email": normalized_email,
                "role": role,
            },
            "temp_password": temp_password,
        }
    }


@router.get("/{user_id}")
async def get_user(
    user_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    row = await conn.fetchrow(
        f"""
        SELECT
          u.id,
          u.email,
          {USER_DISPLAY_NAME_SQL} AS full_name,
          u.role,
          u.phone,
          u.subject_specialization,
          COALESCE(u.is_active, true) AS is_active,
          u.deactivated_at,
          u.deactivated_reason,
          u.created_at
        FROM users u
        WHERE u.id = $1 AND u.school_id = $2
        LIMIT 1
        """,
        user_id,
        school_id,
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    assignment_map = await _fetch_assignments_for_users(conn, school_id, [row["id"]])
    data = _serialize_row(row)
    data["role"] = normalize_user_role(row["role"])
    data["assigned_classes"] = assignment_map.get(str(row["id"]), [])
    return {"data": data}


@router.patch("/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    body: UpdateUserBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    existing = await conn.fetchrow(
        "SELECT role FROM users WHERE id = $1 AND school_id = $2 LIMIT 1",
        user_id,
        school_id,
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    current_role = normalize_user_role(existing["role"])
    next_role = body.role.lower() if body.role else current_role

    if next_role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Cannot assign admin role"},
        )

    await conn.execute(
        """
        UPDATE users
        SET full_name = COALESCE($1, full_name),
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            subject_specialization = COALESCE($3, subject_specialization),
            role = COALESCE($4, role),
            updated_at = NOW()
        WHERE id = $5 AND school_id = $6
        """,
        body.full_name.strip() if body.full_name else None,
        body.phone if body.phone is not None else None,
        body.subject_specialization if body.subject_specialization is not None else None,
        next_role if body.role else None,
        user_id,
        school_id,
    )

    effective_role = next_role if body.role else current_role
    if effective_role in ASSIGNABLE_ROLES and (
        body.assignments is not None or body.class_ids is not None
    ):
        parsed = _parse_assignments(body)
        await _replace_teacher_assignments(
            conn,
            school_id,
            user_id,
            uuid.UUID(str(actor["sub"])),
            parsed,
        )

    updated = await conn.fetchrow(
        f"""
        SELECT id, email, {USER_DISPLAY_NAME_SQL} AS full_name, role, phone, subject_specialization
        FROM users u
        WHERE id = $1
        """,
        user_id,
    )
    data = _serialize_row(updated)
    data["role"] = normalize_user_role(updated["role"])
    return {"data": data}


@router.patch("/{user_id}/deactivate")
async def deactivate_user(
    user_id: uuid.UUID,
    body: DeactivateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    row = await conn.fetchrow(
        """
        UPDATE users
        SET is_active = false,
            account_status = 'INACTIVE',
            deactivated_at = NOW(),
            deactivated_reason = $1,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        RETURNING id
        """,
        body.reason.strip() if body.reason else None,
        user_id,
        school_id,
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    return {"data": {"ok": True}}


@router.patch("/{user_id}/reactivate")
async def reactivate_user(
    user_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    row = await conn.fetchrow(
        """
        UPDATE users
        SET is_active = true,
            account_status = 'ACTIVE',
            deactivated_at = NULL,
            deactivated_reason = NULL,
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING id
        """,
        user_id,
        school_id,
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    return {"data": {"ok": True}}


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)

    row = await conn.fetchrow(
        """
        SELECT id, email, auth_user_id
        FROM users
        WHERE id = $1 AND school_id = $2
        LIMIT 1
        """,
        user_id,
        school_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    if central_auth_enabled():
        try:
            linked = await sync_user_password(
                row["email"],
                temp_password,
                str(row["auth_user_id"]) if row["auth_user_id"] else None,
            )
        except CentralAuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": str(exc), "code": exc.code or "AUTH_SERVICE_ERROR"},
            ) from exc
        if linked:
            await conn.execute(
                "UPDATE users SET auth_user_id = $1 WHERE id = $2 AND auth_user_id IS NULL",
                uuid.UUID(linked),
                user_id,
            )

    updated = await conn.fetchrow(
        """
        UPDATE users
        SET password_hash = $1,
            is_temp_password = true,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        RETURNING id
        """,
        password_hash,
        user_id,
        school_id,
    )

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found"})

    return {"data": {"temp_password": temp_password}}
