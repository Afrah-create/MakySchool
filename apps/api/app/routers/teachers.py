import re
import secrets
import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from app.lib.password import hash_password
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.permissions import can
from app.lib.teacher_assignments import (
    AssignmentInput,
    format_class_name,
    get_current_term_id,
    scaffold_term_submissions,
    sync_teacher_assignments,
)
from app.lib.user_sql import USER_DISPLAY_NAME_SQL, USER_LEARNER_ROLE_SQL
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?[0-9\s\-]{7,15}$")
BLOCKED_SELF_UPDATE_FIELDS = frozenset(
    {"role", "email", "school_id", "assignments", "is_active"},
)

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class AssignmentBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID | None = None


class CreateTeacherBody(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    subject_specialization: str | None = None
    assignments: list[AssignmentBody] = Field(default_factory=list)


class UpdateTeacherBody(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    subject_specialization: str | None = None
    assignments: list[AssignmentBody] | None = None
    acknowledge_assignment_warnings: bool = False


class ProfileUpdateBody(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class DeactivateBody(BaseModel):
    reason: str | None = None


def _serialize_row(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    for key, value in data.items():
        if isinstance(value, uuid.UUID):
            data[key] = str(value)
    return data


def _learner_role_sql(alias: str) -> str:
    return USER_LEARNER_ROLE_SQL.replace("u.", f"{alias}.")


async def _validate_teacher_fields(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    data: dict[str, Any],
    *,
    require_email: bool = False,
    require_name: bool = False,
) -> dict[str, str]:
    fields: dict[str, str] = {}

    if require_name or data.get("full_name") is not None:
        name = (data.get("full_name") or "").strip()
        if not name:
            fields["full_name"] = "Full name is required."
        elif len(name) < 2:
            fields["full_name"] = "Full name must be at least 2 characters."
        elif len(name) > 100:
            fields["full_name"] = "Full name must be under 100 characters."

    if require_email or data.get("email") is not None:
        email = (data.get("email") or "").strip()
        if not email:
            fields["email"] = "Email address is required."
        elif not EMAIL_RE.match(email):
            fields["email"] = "Enter a valid email address."

    phone = data.get("phone")
    if phone is not None and str(phone).strip():
        if not PHONE_RE.match(str(phone).strip()):
            fields["phone"] = "Enter a valid phone number."

    assignments: list[AssignmentInput] | None = data.get("assignments")
    if assignments is not None:
        for index, item in enumerate(assignments):
            class_check = await conn.fetchval(
                "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
                item.class_id,
                school_id,
            )
            if not class_check:
                fields["assignments"] = (
                    f"Class assignment {index + 1} references a class that does not exist in your school."
                )
                break

            if item.subject_id:
                subject_check = await conn.fetchval(
                    """
                    SELECT 1
                    FROM school_subjects s
                    JOIN school_class_subjects cs ON cs.subject_id = s.id AND cs.class_id = $1
                    WHERE s.id = $2 AND s.school_id = $3
                    LIMIT 1
                    """,
                    item.class_id,
                    item.subject_id,
                    school_id,
                )
                if not subject_check:
                    fields["assignments"] = (
                        f"Subject in assignment {index + 1} is not linked to the selected class."
                    )
                    break

    return fields


async def _insert_assignments(
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": result["error"],
                "code": "SERVER_ERROR",
            },
        )


async def _fetch_teacher_detail(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> dict[str, Any] | None:
    teacher = await conn.fetchrow(
        f"""
        SELECT
          u.id,
          {USER_DISPLAY_NAME_SQL} AS full_name,
          u.email,
          u.phone,
          u.subject_specialization,
          COALESCE(u.is_active, true) AS is_active,
          u.created_at,
          u.last_login,
          u.last_login_at,
          u.profile_updated_at,
          u.created_by,
          COALESCE(creator.name, creator.full_name) AS created_by_name
        FROM users u
        LEFT JOIN users creator ON creator.id = u.created_by
        WHERE u.id = $1
          AND u.school_id = $2
          AND LOWER(u.role) = 'teacher'
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    if not teacher:
        return None

    assignment_rows = await conn.fetch(
        """
        SELECT
          tca.id AS assignment_id,
          sc.id AS class_id,
          sc.level,
          sc.stream,
          s.id AS subject_id,
          s.name AS subject_name
        FROM teacher_class_assignments tca
        JOIN school_classes sc ON sc.id = tca.class_id
        LEFT JOIN school_subjects s ON s.id = tca.subject_id
        WHERE tca.school_id = $1 AND tca.teacher_id = $2
        ORDER BY sc.level, sc.stream, s.name
        """,
        school_id,
        teacher_id,
    )

    assignments = [
        {
            "assignment_id": str(row["assignment_id"]),
            "class_id": str(row["class_id"]),
            "class_name": format_class_name(row["level"], row["stream"]),
            "stream": row["stream"],
            "subject_id": str(row["subject_id"]) if row["subject_id"] else None,
            "subject_name": row["subject_name"],
        }
        for row in assignment_rows
    ]

    term_id = await get_current_term_id(conn, school_id)
    submission_rows = await conn.fetch(
        """
        SELECT
          sc.level,
          sc.stream,
          tts.status,
          tts.submitted_at
        FROM teacher_term_submissions tts
        JOIN school_classes sc ON sc.id = tts.class_id
        WHERE tts.school_id = $1
          AND tts.teacher_id = $2
          AND ($3::uuid IS NULL OR tts.term_id = $3)
        ORDER BY sc.level, sc.stream
        """,
        school_id,
        teacher_id,
        term_id,
    )

    submission_status = [
        {
            "class_name": format_class_name(row["level"], row["stream"]),
            "status": row["status"],
            "submitted_at": row["submitted_at"],
        }
        for row in submission_rows
    ]

    learner_sql = _learner_role_sql("learners")
    total_students = await conn.fetchval(
        f"""
        SELECT COUNT(DISTINCT learners.id)::int
        FROM teacher_class_assignments tca
        LEFT JOIN users learners
          ON learners.school_class_id = tca.class_id
         AND learners.school_id = tca.school_id
         AND {learner_sql}
        WHERE tca.school_id = $1 AND tca.teacher_id = $2
        """,
        school_id,
        teacher_id,
    )

    return {
        "id": str(teacher["id"]),
        "full_name": teacher["full_name"],
        "email": teacher["email"],
        "phone": teacher["phone"],
        "subject_specialization": teacher["subject_specialization"],
        "role": "teacher",
        "is_active": teacher["is_active"],
        "created_at": teacher["created_at"],
        "last_login": teacher["last_login"] or teacher["last_login_at"],
        "profile_updated_at": teacher["profile_updated_at"],
        "created_by": str(teacher["created_by"]) if teacher["created_by"] else None,
        "created_by_name": teacher["created_by_name"],
        "assignments": assignments,
        "submission_status": submission_status,
        "total_students": int(total_students or 0),
    }


@router.get("/me")
async def get_my_teacher_profile(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if actor["role"] != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only teachers can access this endpoint.",
                "code": "FORBIDDEN",
            },
        )

    teacher = await _fetch_teacher_detail(conn, school_id, uuid.UUID(str(actor["sub"])))
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher profile not found.", "code": "NOT_FOUND"},
        )

    return {"data": teacher}


@router.get("")
async def list_teachers(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    search: str | None = Query(None),
    is_active: str | None = Query(None, alias="is_active"),
    class_id: uuid.UUID | None = Query(None, alias="class_id"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    school_id, _actor = ctx
    offset = (page - 1) * limit

    conditions = ["u.school_id = $1", "LOWER(u.role) = 'teacher'"]
    params: list[Any] = [school_id]
    param_index = 2

    if is_active in ("true", "false"):
        conditions.append(f"COALESCE(u.is_active, true) = ${param_index}")
        params.append(is_active == "true")
        param_index += 1

    if class_id:
        conditions.append(
            f"""EXISTS (
              SELECT 1 FROM teacher_class_assignments tca_f
              WHERE tca_f.teacher_id = u.id AND tca_f.school_id = u.school_id
                AND tca_f.class_id = ${param_index}
            )"""
        )
        params.append(class_id)
        param_index += 1

    if search and search.strip():
        conditions.append(
            f"({USER_DISPLAY_NAME_SQL} ILIKE ${param_index} OR u.email ILIKE ${param_index})"
        )
        params.append(f"%{search.strip()}%")
        param_index += 1

    where_clause = " AND ".join(conditions)
    learner_sql = _learner_role_sql("learners")

    total = await conn.fetchval(
        f"""
        SELECT COUNT(DISTINCT u.id)::int
        FROM users u
        WHERE {where_clause}
        """,
        *params,
    )

    list_params = [*params, limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
          u.id,
          {USER_DISPLAY_NAME_SQL} AS full_name,
          u.email,
          u.phone,
          u.subject_specialization,
          COALESCE(u.is_active, true) AS is_active,
          u.created_at,
          COALESCE(u.last_login, u.last_login_at) AS last_login,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'assignment_id', tca.id,
                'class_id', sc.id,
                'class_name', sc.level || COALESCE(sc.stream, ''),
                'stream', sc.stream,
                'subject_id', s.id,
                'subject_name', s.name
              )
            ) FILTER (WHERE tca.id IS NOT NULL),
            '[]'
          ) AS assignments,
          COALESCE((
            SELECT COUNT(DISTINCT learners.id)::int
            FROM teacher_class_assignments tca2
            LEFT JOIN users learners
              ON learners.school_class_id = tca2.class_id
             AND learners.school_id = tca2.school_id
             AND {learner_sql}
            WHERE tca2.teacher_id = u.id AND tca2.school_id = u.school_id
          ), 0) AS total_students
        FROM users u
        LEFT JOIN teacher_class_assignments tca
          ON tca.teacher_id = u.id AND tca.school_id = u.school_id
        LEFT JOIN school_classes sc ON sc.id = tca.class_id
        LEFT JOIN school_subjects s ON s.id = tca.subject_id
        WHERE {where_clause}
        GROUP BY u.id
        ORDER BY {USER_DISPLAY_NAME_SQL} ASC
        LIMIT ${param_index} OFFSET ${param_index + 1}
        """,
        *list_params,
    )

    teachers = [_serialize_row(row) for row in rows]
    return {"data": {"teachers": teachers, "total": int(total or 0), "page": page, "limit": limit}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_teacher(
    body: CreateTeacherBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teachers.",
                "code": "FORBIDDEN",
            },
        )

    assignments = [
        AssignmentInput(class_id=a.class_id, subject_id=a.subject_id) for a in body.assignments
    ]
    fields = await _validate_teacher_fields(
        conn,
        school_id,
        {
            "full_name": body.full_name,
            "email": body.email,
            "phone": body.phone,
            "assignments": assignments,
        },
        require_email=True,
        require_name=True,
    )
    if fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please fix the highlighted fields and try again.",
                "code": "VALIDATION_ERROR",
                "fields": fields,
            },
        )

    normalized_email = body.email.lower().strip()
    existing = await conn.fetchval(
        "SELECT id FROM users WHERE school_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1",
        school_id,
        normalized_email,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "A teacher with this email already exists in your school.",
                "code": "VALIDATION_ERROR",
                "fields": {
                    "email": "A teacher with this email already exists in your school.",
                },
            },
        )

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)
    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with conn.transaction():
            teacher_id = await conn.fetchval(
                """
                INSERT INTO users (
                  id, full_name, name, email, phone, subject_specialization,
                  password_hash, role, school_id, account_status,
                  is_active, is_temp_password, setup_completed, created_by, created_at
                ) VALUES (
                  gen_random_uuid(), $1, $1, $2, $3, $4,
                  $5, 'teacher', $6, 'ACTIVE',
                  true, true, true, $7, NOW()
                )
                RETURNING id
                """,
                body.full_name.strip(),
                normalized_email,
                body.phone.strip() if body.phone else None,
                body.subject_specialization.strip() if body.subject_specialization else None,
                password_hash,
                school_id,
                actor_id,
            )

            if assignments:
                await _insert_assignments(conn, school_id, teacher_id, actor_id, assignments)
                await scaffold_term_submissions(conn, school_id, teacher_id, assignments)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    teacher = await _fetch_teacher_detail(conn, school_id, teacher_id)
    return {"data": {"teacher": teacher, "temp_password": temp_password}}


@router.get("/{teacher_id}")
async def get_teacher(
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _actor = ctx

    teacher = await _fetch_teacher_detail(conn, school_id, teacher_id)
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    return {"data": teacher}


@router.patch("/{teacher_id}/profile")
async def update_teacher_profile(
    teacher_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    raw_body = await request.json()
    for field in BLOCKED_SELF_UPDATE_FIELDS:
        if field in raw_body:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": (
                        "You cannot change your role or class assignments. "
                        "Contact your school administrator."
                    ),
                    "code": "FORBIDDEN",
                },
            )

    body = ProfileUpdateBody(**raw_body)

    if uuid.UUID(str(actor["sub"])) != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You can only update your own profile.",
                "code": "FORBIDDEN",
            },
        )

    fields = await _validate_teacher_fields(
        conn,
        school_id,
        {"full_name": body.full_name, "phone": body.phone},
    )
    if fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please fix the highlighted fields and try again.",
                "code": "VALIDATION_ERROR",
                "fields": fields,
            },
        )

    row = await conn.fetchrow(
        """
        UPDATE users
        SET full_name = COALESCE($1, full_name),
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            profile_updated_at = NOW(),
            updated_at = NOW()
        WHERE id = $3 AND school_id = $4 AND LOWER(role) = 'teacher'
        RETURNING id
        """,
        body.full_name.strip() if body.full_name else None,
        body.phone.strip() if body.phone else None,
        teacher_id,
        school_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    teacher = await _fetch_teacher_detail(conn, school_id, teacher_id)
    return {"data": teacher}


@router.patch("/{teacher_id}")
async def update_teacher(
    teacher_id: uuid.UUID,
    body: UpdateTeacherBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teachers.",
                "code": "FORBIDDEN",
            },
        )

    existing = await conn.fetchval(
        """
        SELECT id FROM users
        WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    assignments = (
        [AssignmentInput(class_id=a.class_id, subject_id=a.subject_id) for a in body.assignments]
        if body.assignments is not None
        else None
    )
    fields = await _validate_teacher_fields(
        conn,
        school_id,
        {
            "full_name": body.full_name,
            "phone": body.phone,
            "assignments": assignments,
        },
    )
    if fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please fix the highlighted fields and try again.",
                "code": "VALIDATION_ERROR",
                "fields": fields,
            },
        )

    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE users
                SET full_name = COALESCE($1, full_name),
                    name = COALESCE($1, name),
                    phone = COALESCE($2, phone),
                    subject_specialization = COALESCE($3, subject_specialization),
                    profile_updated_at = NOW(),
                    updated_at = NOW()
                WHERE id = $4 AND school_id = $5
                """,
                body.full_name.strip() if body.full_name else None,
                body.phone if body.phone is not None else None,
                body.subject_specialization if body.subject_specialization is not None else None,
                teacher_id,
                school_id,
            )

            if assignments is not None:
                sync_result = await sync_teacher_assignments(
                    conn,
                    school_id,
                    teacher_id,
                    actor_id,
                    assignments,
                    acknowledge_warnings=body.acknowledge_assignment_warnings,
                )
                if not sync_result["ok"]:
                    if sync_result["code"] == "ASSIGNMENT_LOCKED":
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail={
                                "error": sync_result["error"],
                                "code": sync_result["code"],
                                "fields": sync_result.get("fields"),
                                "preview": sync_result["preview"],
                            },
                        )
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "error": sync_result["error"],
                            "code": sync_result["code"],
                            "preview": sync_result["preview"],
                        },
                    )

                to_add = [
                    AssignmentInput(
                        class_id=uuid.UUID(item["class_id"]),
                        subject_id=uuid.UUID(item["subject_id"]) if item.get("subject_id") else None,
                    )
                    for item in sync_result["preview"]["to_add"]
                ]
                if to_add:
                    await scaffold_term_submissions(conn, school_id, teacher_id, to_add)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    teacher = await _fetch_teacher_detail(conn, school_id, teacher_id)
    return {"data": teacher}


@router.patch("/{teacher_id}/deactivate")
async def deactivate_teacher(
    teacher_id: uuid.UUID,
    body: DeactivateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teachers.",
                "code": "FORBIDDEN",
            },
        )

    teacher = await conn.fetchrow(
        f"""
        SELECT {USER_DISPLAY_NAME_SQL} AS full_name, COALESCE(is_active, true) AS is_active
        FROM users
        WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    if not teacher["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This teacher account is already deactivated.",
                "code": "ALREADY_DEACTIVATED",
            },
        )

    await conn.execute(
        """
        UPDATE users
        SET is_active = false,
            deactivated_at = NOW(),
            deactivated_reason = $1,
            account_status = 'SUSPENDED',
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        """,
        body.reason.strip() if body.reason else None,
        teacher_id,
        school_id,
    )

    return {
        "data": {
            "message": (
                f"{teacher['full_name']}'s account has been deactivated. "
                "They will not be able to log in."
            ),
            "teacher": {
                "id": str(teacher_id),
                "full_name": teacher["full_name"],
                "is_active": False,
            },
        }
    }


@router.patch("/{teacher_id}/reactivate")
async def reactivate_teacher(
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teachers.",
                "code": "FORBIDDEN",
            },
        )

    teacher = await conn.fetchrow(
        f"""
        SELECT {USER_DISPLAY_NAME_SQL} AS full_name, COALESCE(is_active, true) AS is_active
        FROM users
        WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    if teacher["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This teacher account is already active.",
                "code": "ALREADY_ACTIVE",
            },
        )

    await conn.execute(
        """
        UPDATE users
        SET is_active = true,
            deactivated_at = NULL,
            deactivated_reason = NULL,
            account_status = 'ACTIVE',
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        teacher_id,
        school_id,
    )

    return {
        "data": {
            "message": (
                f"{teacher['full_name']}'s account has been reactivated. They can now log in."
            ),
            "teacher": {
                "id": str(teacher_id),
                "full_name": teacher["full_name"],
                "is_active": True,
            },
        }
    }


@router.post("/{teacher_id}/reset-password")
async def reset_teacher_password(
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageUsers"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teachers.",
                "code": "FORBIDDEN",
            },
        )

    temp_password = secrets.token_hex(10)
    password_hash = hash_password(temp_password)

    row = await conn.fetchrow(
        """
        UPDATE users
        SET password_hash = $1,
            is_temp_password = true,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3 AND LOWER(role) = 'teacher'
        RETURNING id
        """,
        password_hash,
        teacher_id,
        school_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    return {"data": {"temp_password": temp_password}}
