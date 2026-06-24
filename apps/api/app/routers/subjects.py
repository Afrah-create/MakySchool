import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.db.pool import get_db
from app.lib.classes import get_allowed_levels_sql_param, get_school_type
from app.lib.pg_json import parse_uuid_list, parse_uuid_string_list
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

Ctx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class CreateSubjectBody(BaseModel):
    name: str | None = None


class UpdateSubjectBody(BaseModel):
    name: str | None = None


class UpdateSubjectClassesBody(BaseModel):
    classIds: list[str] | None = None


def _rows(rows: list[asyncpg.Record]) -> list[dict[str, Any]]:
    return jsonable_encoder([dict(row) for row in rows])


def _row(row: asyncpg.Record | None) -> Any:
    if row is None:
        return None
    return jsonable_encoder(dict(row))


def _subject_row(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    data["class_ids"] = parse_uuid_string_list(data.get("class_ids"))
    return jsonable_encoder(data)


@router.get("")
async def list_subjects(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    rows = await conn.fetch(
        """
        SELECT
           s.id,
           s.name,
           s.created_at,
           COALESCE((
             SELECT COUNT(*)::int
             FROM school_class_subjects cs
             WHERE cs.subject_id = s.id
           ), 0) AS class_count,
           COALESCE((
             SELECT json_agg(cs.class_id)
             FROM school_class_subjects cs
             WHERE cs.subject_id = s.id
           ), '[]'::json) AS class_ids
         FROM school_subjects s
         WHERE s.school_id = $1
         ORDER BY s.name ASC
        """,
        school_id,
    )

    return {"data": [_subject_row(row) for row in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_subject(
    body: CreateSubjectBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Subject name is required"},
        )

    duplicate = await conn.fetchrow(
        "SELECT id FROM school_subjects WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
        school_id,
        name,
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "A subject with this name already exists.",
                "code": "DUPLICATE_SUBJECT",
            },
        )

    row = await conn.fetchrow(
        """
        INSERT INTO school_subjects (id, school_id, name)
        VALUES ($1, $2, $3)
        RETURNING *
        """,
        uuid.uuid4(),
        school_id,
        name,
    )

    return {"data": _row(row)}


@router.patch("/{subject_id}")
async def update_subject(
    subject_id: uuid.UUID,
    body: UpdateSubjectBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Subject name is required"},
        )

    duplicate = await conn.fetchrow(
        """
        SELECT id FROM school_subjects
        WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3
        LIMIT 1
        """,
        school_id,
        name,
        subject_id,
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "A subject with this name already exists.",
                "code": "DUPLICATE_SUBJECT",
            },
        )

    row = await conn.fetchrow(
        """
        UPDATE school_subjects
        SET name = $1,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        RETURNING *
        """,
        name,
        subject_id,
        school_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Subject not found"})

    return {"data": _row(row)}


@router.put("/{subject_id}/classes")
async def update_subject_classes(
    subject_id: uuid.UUID,
    body: UpdateSubjectClassesBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    if body.classIds is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "classIds must be an array"},
        )

    subject = await conn.fetchrow(
        "SELECT id FROM school_subjects WHERE id = $1 AND school_id = $2",
        subject_id,
        school_id,
    )
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Subject not found"})

    unique_class_ids = list(dict.fromkeys(body.classIds))
    class_uuids = parse_uuid_list(unique_class_ids) if unique_class_ids else []

    if class_uuids:
        school_type = await get_school_type(conn, school_id)
        allowed_levels = get_allowed_levels_sql_param(school_type)

        valid_classes = await conn.fetch(
            """
            SELECT id FROM school_classes
            WHERE school_id = $1
              AND id = ANY($2::uuid[])
              AND level = ANY($3::text[])
            """,
            school_id,
            class_uuids,
            allowed_levels,
        )

        if len(valid_classes) != len(class_uuids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "One or more classes are invalid for your school type.",
                    "code": "INVALID_CLASS",
                },
            )

    async with conn.transaction():
        await conn.execute(
            "DELETE FROM school_class_subjects WHERE school_id = $1 AND subject_id = $2",
            school_id,
            subject_id,
        )

        for class_id in class_uuids:
            await conn.execute(
                """
                INSERT INTO school_class_subjects (id, school_id, class_id, subject_id)
                VALUES ($1, $2, $3, $4)
                """,
                uuid.uuid4(),
                school_id,
                class_id,
                subject_id,
            )

    return {"data": {"ok": True, "classIds": [str(class_id) for class_id in class_uuids]}}


@router.delete("/{subject_id}")
async def delete_subject(
    subject_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    link_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS count
        FROM school_class_subjects
        WHERE school_id = $1 AND subject_id = $2
        """,
        school_id,
        subject_id,
    )
    count = int(link_row["count"] if link_row else 0)
    if count > 0:
        suffix = "" if count == 1 else "es"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": (
                    f"Cannot delete this subject. It is linked to {count} class{suffix}. "
                    "Unlink it first."
                ),
                "code": "SUBJECT_HAS_LINKS",
                "classCount": count,
            },
        )

    deleted = await conn.fetchrow(
        "DELETE FROM school_subjects WHERE id = $1 AND school_id = $2 RETURNING id",
        subject_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Subject not found"})

    return {"data": {"ok": True}}
