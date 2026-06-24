import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.db.pool import get_db
from app.lib.classes import (
    build_level_order_case,
    find_duplicate_class,
    format_class_label,
    get_allowed_levels_sql_param,
    get_school_type,
    is_level_allowed_for_school_type,
)
from app.lib.pg_json import parse_pg_json
from app.lib.user_sql import USER_LEARNER_ROLE_SQL
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.middleware.teacher_scope import assert_class_access, get_allowed_class_ids

router = APIRouter()

Ctx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]
AllowedClassIds = Annotated[list[uuid.UUID] | None, Depends(get_allowed_class_ids)]


class CreateClassBody(BaseModel):
    level: str | None = None
    stream: str | None = None
    capacity: int | None = None


class UpdateClassBody(BaseModel):
    level: str | None = None
    stream: str | None = None
    capacity: int | None = None


class AssignSubjectBody(BaseModel):
    subjectId: str | None = None


def _rows(rows: list[asyncpg.Record]) -> list[dict[str, Any]]:
    return jsonable_encoder([dict(row) for row in rows])


def _row(row: asyncpg.Record | None) -> Any:
    if row is None:
        return None
    return jsonable_encoder(dict(row))


def _class_row(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    subjects = parse_pg_json(data.get("subjects"), default=[])
    data["subjects"] = subjects if isinstance(subjects, list) else []
    return jsonable_encoder(data)


@router.get("")
async def list_classes(
    ctx: Ctx,
    allowed_class_ids: AllowedClassIds,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    school_type = await get_school_type(conn, school_id)
    allowed_levels = get_allowed_levels_sql_param(school_type)
    level_order = build_level_order_case("c.level", school_type)

    if allowed_class_ids is None:
        class_filter = ""
        query_params: list[Any] = [school_id, allowed_levels]
    elif len(allowed_class_ids) == 0:
        class_filter = " AND FALSE"
        query_params = [school_id, allowed_levels]
    else:
        class_filter = " AND c.id = ANY($3::uuid[])"
        query_params = [school_id, allowed_levels, allowed_class_ids]

    rows = await conn.fetch(
        f"""
        SELECT
           c.id,
           c.level,
           c.stream,
           c.capacity,
           c.sort_order,
           COALESCE((
             SELECT COUNT(*)::int
             FROM users u
             WHERE u.school_id = c.school_id
               AND {USER_LEARNER_ROLE_SQL}
               AND u.school_class_id = c.id
           ), 0) AS student_count,
           COALESCE((
             SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
             FROM school_class_subjects cs
             JOIN school_subjects s ON s.id = cs.subject_id
             WHERE cs.class_id = c.id
           ), '[]'::json) AS subjects
         FROM school_classes c
         WHERE c.school_id = $1
           AND c.level = ANY($2::text[]){class_filter}
         ORDER BY {level_order}, COALESCE(c.sort_order, 9999), COALESCE(c.stream, ''), c.created_at ASC
        """,
        *query_params,
    )

    return {"data": [_class_row(row) for row in rows]}


@router.get("/{class_id}")
async def get_class(
    class_id: uuid.UUID,
    ctx: Ctx,
    allowed_class_ids: AllowedClassIds,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx

    if not assert_class_access(allowed_class_ids, class_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    row = await conn.fetchrow(
        f"""
        SELECT
           c.id,
           c.level,
           c.stream,
           c.capacity,
           COALESCE((
             SELECT COUNT(*)::int
             FROM users u
             WHERE u.school_id = c.school_id
               AND {USER_LEARNER_ROLE_SQL}
               AND u.school_class_id = c.id
           ), 0) AS student_count,
           COALESCE((
             SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
             FROM school_class_subjects cs
             JOIN school_subjects s ON s.id = cs.subject_id
             WHERE cs.class_id = c.id
           ), '[]'::json) AS subjects
         FROM school_classes c
         WHERE c.id = $1 AND c.school_id = $2
         LIMIT 1
        """,
        class_id,
        school_id,
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Class not found"})

    data = _class_row(row)
    teacher_subjects: list[dict[str, Any]] = []
    if user.get("role") == "teacher":
        teacher_rows = await conn.fetch(
            """
            SELECT s.id, s.name
            FROM teacher_class_assignments tca
            JOIN school_subjects s ON s.id = tca.subject_id
            WHERE tca.school_id = $1 AND tca.teacher_id = $2 AND tca.class_id = $3
            """,
            school_id,
            user["user_db_id"],
            class_id,
        )
        teacher_subjects = _rows(teacher_rows)

    data["teacher_subjects"] = teacher_subjects
    return {"data": data}


@router.get("/{class_id}/subjects")
async def get_class_subjects(
    class_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    class_row = await conn.fetchrow(
        "SELECT id FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        class_id,
        school_id,
    )
    if not class_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Class not found"})

    rows = await conn.fetch(
        """
        SELECT s.id, s.name
        FROM school_class_subjects cs
        JOIN school_subjects s ON s.id = cs.subject_id
        WHERE cs.school_id = $1 AND cs.class_id = $2
        ORDER BY s.name ASC
        """,
        school_id,
        class_id,
    )

    return {"data": _rows(rows)}


@router.get("/{class_id}/students")
async def get_class_students(
    class_id: uuid.UUID,
    ctx: Ctx,
    allowed_class_ids: AllowedClassIds,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    if not assert_class_access(allowed_class_ids, class_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Forbidden"})

    rows = await conn.fetch(
        f"""
        SELECT
           u.id,
           COALESCE(u.name, u.full_name) AS name,
           u.student_number AS learner_id,
           NULL::text AS gender
         FROM users u
         WHERE u.school_id = $1
           AND {USER_LEARNER_ROLE_SQL}
           AND u.school_class_id = $2
         ORDER BY COALESCE(u.name, u.full_name) ASC
        """,
        school_id,
        class_id,
    )

    return {"data": _rows(rows)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_class(
    body: CreateClassBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    if not body.level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Level is required"},
        )

    normalized_stream = body.stream.strip() if body.stream and body.stream.strip() else None
    school_type = await get_school_type(conn, school_id)

    if not is_level_allowed_for_school_type(body.level, school_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "This class level is not allowed for your school type.",
                "code": "INVALID_LEVEL",
            },
        )

    if await find_duplicate_class(conn, school_id, body.level, normalized_stream):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": f"{format_class_label(body.level, normalized_stream)} already exists.",
                "code": "DUPLICATE_CLASS",
            },
        )

    row = await conn.fetchrow(
        """
        INSERT INTO school_classes (id, school_id, level, stream, capacity)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        uuid.uuid4(),
        school_id,
        body.level,
        normalized_stream,
        body.capacity,
    )

    return {"data": _row(row)}


@router.patch("/{class_id}")
async def update_class(
    class_id: uuid.UUID,
    body: UpdateClassBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    existing = await conn.fetchrow(
        "SELECT level, stream, capacity FROM school_classes WHERE id = $1 AND school_id = $2",
        class_id,
        school_id,
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Class not found"})

    next_level = body.level if body.level is not None else existing["level"]
    if body.stream is None:
        next_stream = existing["stream"]
    else:
        next_stream = body.stream.strip() if body.stream and body.stream.strip() else None

    school_type = await get_school_type(conn, school_id)
    if not is_level_allowed_for_school_type(next_level, school_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "This class level is not allowed for your school type.",
                "code": "INVALID_LEVEL",
            },
        )

    if await find_duplicate_class(conn, school_id, next_level, next_stream, class_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": f"{format_class_label(next_level, next_stream)} already exists.",
                "code": "DUPLICATE_CLASS",
            },
        )

    next_capacity = existing["capacity"] if body.capacity is None else body.capacity
    row = await conn.fetchrow(
        """
        UPDATE school_classes
        SET level = $1,
            stream = $2,
            capacity = $3,
            updated_at = NOW()
        WHERE id = $4 AND school_id = $5
        RETURNING *
        """,
        next_level,
        next_stream,
        next_capacity,
        class_id,
        school_id,
    )

    return {"data": _row(row)}


@router.delete("/{class_id}")
async def delete_class(
    class_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    class_row = await conn.fetchrow(
        "SELECT level, stream FROM school_classes WHERE id = $1 AND school_id = $2",
        class_id,
        school_id,
    )
    if not class_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Class not found"})

    count_row = await conn.fetchrow(
        f"""
        SELECT COUNT(*)::int AS count
        FROM users u
        WHERE u.school_id = $1
          AND {USER_LEARNER_ROLE_SQL}
          AND u.school_class_id = $2
        """,
        school_id,
        class_id,
    )
    count = int(count_row["count"] if count_row else 0)
    class_label = format_class_label(class_row["level"], class_row["stream"])

    if count > 0:
        suffix = "" if count == 1 else "s"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": (
                    f"Cannot delete {class_label}. {count} student{suffix} are currently "
                    "enrolled. Please move them first."
                ),
                "code": "CLASS_HAS_STUDENTS",
                "studentCount": count,
            },
        )

    await conn.execute(
        "DELETE FROM school_classes WHERE id = $1 AND school_id = $2",
        class_id,
        school_id,
    )
    return {"data": {"ok": True, "label": class_label}}


@router.post("/{class_id}/subjects", status_code=status.HTTP_201_CREATED)
async def assign_subject_to_class(
    class_id: uuid.UUID,
    body: AssignSubjectBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    if not body.subjectId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing tenant context or subject id"},
        )

    await conn.execute(
        """
        INSERT INTO school_class_subjects (id, school_id, class_id, subject_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (class_id, subject_id) DO NOTHING
        """,
        uuid.uuid4(),
        school_id,
        class_id,
        uuid.UUID(body.subjectId),
    )

    return {"data": {"ok": True}}


@router.delete("/{class_id}/subjects/{subject_id}")
async def remove_subject_from_class(
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    await conn.execute(
        "DELETE FROM school_class_subjects WHERE school_id = $1 AND class_id = $2 AND subject_id = $3",
        school_id,
        class_id,
        subject_id,
    )
    return {"data": {"ok": True}}
