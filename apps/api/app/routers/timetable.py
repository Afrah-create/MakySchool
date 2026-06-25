from __future__ import annotations

import uuid
from datetime import time
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.permissions import can
from app.lib.teacher_assignments import format_class_name, get_current_term_id
from app.lib.timetable.conflicts import (
    PeriodInput,
    fetch_period_rows,
    validate_bulk_replace,
)
from app.lib.timetable.errors import TimetableValidationError
from app.lib.timetable.templates import (
    PeriodTemplate,
    fetch_period_templates,
    replace_period_templates,
    serialize_template,
)
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.middleware.teacher_scope import assert_class_access, get_allowed_class_ids

router = APIRouter()

Ctx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]
AllowedClassIds = Annotated[list[uuid.UUID] | None, Depends(get_allowed_class_ids)]


class PeriodBody(BaseModel):
    dayOfWeek: int = Field(ge=1, le=7)
    periodNumber: int = Field(ge=1)
    startTime: str
    endTime: str
    subjectId: uuid.UUID
    teacherId: uuid.UUID
    track: str = "secular"


class BulkReplaceBody(BaseModel):
    classId: uuid.UUID
    termId: uuid.UUID | None = None
    periods: list[PeriodBody] = Field(default_factory=list)


class ClassTimetableBody(BaseModel):
    classId: uuid.UUID
    periods: list[PeriodBody] = Field(default_factory=list)


class MultiBulkReplaceBody(BaseModel):
    termId: uuid.UUID | None = None
    classes: list[ClassTimetableBody] = Field(min_length=1)


class PeriodTemplateBody(BaseModel):
    periodNumber: int = Field(ge=1)
    label: str | None = None
    startTime: str
    endTime: str


class PeriodTemplatesBody(BaseModel):
    periods: list[PeriodTemplateBody] = Field(default_factory=list)


def _error(
    status_code: int,
    error: str,
    code: str,
    fields: dict[str, str] | None = None,
) -> HTTPException:
    detail: dict[str, Any] = {"error": error, "code": code}
    if fields:
        detail["fields"] = fields
    return HTTPException(status_code=status_code, detail=detail)


def _require_permission(user: dict[str, Any], action: str) -> None:
    if not can(user.get("role", ""), action):
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "You do not have permission to perform this action.",
            "FORBIDDEN",
        )


def _parse_time(value: str) -> time:
    parts = value.strip().split(":")
    if len(parts) < 2:
        raise ValueError("invalid time")
    hour = int(parts[0])
    minute = int(parts[1])
    second = int(parts[2]) if len(parts) > 2 else 0
    return time(hour, minute, second)


def _template_input(body: PeriodTemplateBody) -> PeriodTemplate:
    try:
        start = _parse_time(body.startTime)
        end = _parse_time(body.endTime)
    except ValueError:
        raise TimetableValidationError(
            "Enter a valid time in HH:MM format.",
            "INVALID_TIME",
        )
    return PeriodTemplate(
        period_number=body.periodNumber,
        label=body.label,
        start_time=start,
        end_time=end,
    )


def _period_input(body: PeriodBody) -> PeriodInput:
    try:
        start = _parse_time(body.startTime)
        end = _parse_time(body.endTime)
    except ValueError:
        raise TimetableValidationError(
            "Enter a valid time in HH:MM format.",
            "INVALID_TIME",
        )
    return PeriodInput(
        day_of_week=body.dayOfWeek,
        period_number=body.periodNumber,
        start_time=start,
        end_time=end,
        subject_id=body.subjectId,
        teacher_id=body.teacherId,
        track=body.track,
    )


def _serialize_period(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "class_id", "term_id", "subject_id", "teacher_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    if data.get("start_time") is not None:
        data["start_time"] = data["start_time"].strftime("%H:%M")
    if data.get("end_time") is not None:
        data["end_time"] = data["end_time"].strftime("%H:%M")
    data["class_name"] = format_class_name(data.pop("class_level"), data.pop("class_stream"))
    return jsonable_encoder(data)


def _serialize_grid(
    class_id: uuid.UUID | None,
    term_id: uuid.UUID | None,
    rows: list[asyncpg.Record],
) -> dict[str, Any]:
    return jsonable_encoder(
        {
            "classId": str(class_id) if class_id else None,
            "termId": str(term_id) if term_id else None,
            "periods": [_serialize_period(row) for row in rows],
        }
    )


async def _resolve_term_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID | None,
) -> uuid.UUID | None:
    if term_id is not None:
        return term_id
    return await get_current_term_id(conn, school_id)


async def _replace_class_timetable(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    term_id: uuid.UUID | None,
    periods: list[PeriodInput],
) -> list[asyncpg.Record]:
    await validate_bulk_replace(conn, school_id, class_id, term_id, periods)
    await conn.execute(
        """
        DELETE FROM timetable_periods
        WHERE school_id = $1 AND class_id = $2
          AND term_id IS NOT DISTINCT FROM $3::uuid
        """,
        school_id,
        class_id,
        term_id,
    )
    for period in periods:
        await conn.execute(
            """
            INSERT INTO timetable_periods (
              school_id, class_id, term_id, day_of_week, period_number,
              start_time, end_time, subject_id, teacher_id, track
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            school_id,
            class_id,
            term_id,
            period.day_of_week,
            period.period_number,
            period.start_time,
            period.end_time,
            period.subject_id,
            period.teacher_id,
            period.track,
        )
    return await fetch_period_rows(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
    )


@router.get("/period-templates")
async def get_period_templates(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewTimetable")
    rows = await fetch_period_templates(conn, school_id)
    return {"data": [serialize_template(row) for row in rows]}


@router.put("/period-templates")
async def put_period_templates(
    body: PeriodTemplatesBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageTimetable")
    templates = [_template_input(item) for item in body.periods]
    try:
        rows = await replace_period_templates(conn, school_id, templates)
    except TimetableValidationError as exc:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            exc.message,
            exc.code,
            exc.fields or None,
        )
    return {"data": [serialize_template(row) for row in rows]}


@router.get("")
async def list_timetable(
    ctx: Ctx,
    allowed_class_ids: AllowedClassIds,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID | None = Query(None, alias="classId"),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, user = ctx
    _require_permission(user, "viewTimetable")

    resolved_term = await _resolve_term_id(conn, school_id, term_id)

    if class_id is not None and not assert_class_access(allowed_class_ids, class_id):
        raise _error(status.HTTP_403_FORBIDDEN, "You cannot view this class timetable.", "FORBIDDEN")

    if user["role"] == "teacher":
        teacher_id = user["user_db_id"]
        rows = await fetch_period_rows(
            conn,
            school_id,
            teacher_id=teacher_id,
            term_id=resolved_term,
        )
        if class_id is not None:
            rows = [row for row in rows if row["class_id"] == class_id]
        return {"data": [_serialize_period(row) for row in rows]}

    rows = await fetch_period_rows(
        conn,
        school_id,
        class_id=class_id,
        term_id=resolved_term,
    )
    if allowed_class_ids is not None:
        allowed = set(allowed_class_ids)
        rows = [row for row in rows if row["class_id"] in allowed]

    return {"data": [_serialize_period(row) for row in rows]}


@router.post("")
async def bulk_replace_timetable(
    body: BulkReplaceBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageTimetable")

    periods = [_period_input(item) for item in body.periods]

    try:
        async with conn.transaction():
            rows = await _replace_class_timetable(
                conn,
                school_id,
                body.classId,
                body.termId,
                periods,
            )
    except TimetableValidationError as exc:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            exc.message,
            exc.code,
            exc.fields or None,
        )
    except asyncpg.UniqueViolationError:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "This class already has another subject in that period slot.",
            "CLASS_SLOT_CONFLICT",
        )

    return {"data": _serialize_grid(body.classId, body.termId, rows)}


@router.post("/bulk")
async def bulk_replace_multiple_classes(
    body: MultiBulkReplaceBody,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageTimetable")

    results: list[dict[str, Any]] = []
    try:
        async with conn.transaction():
            for item in body.classes:
                periods = [_period_input(period) for period in item.periods]
                rows = await _replace_class_timetable(
                    conn,
                    school_id,
                    item.classId,
                    body.termId,
                    periods,
                )
                results.append(_serialize_grid(item.classId, body.termId, rows))
    except TimetableValidationError as exc:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            exc.message,
            exc.code,
            exc.fields or None,
        )
    except asyncpg.UniqueViolationError:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "This class already has another subject in that period slot.",
            "CLASS_SLOT_CONFLICT",
        )

    return {"data": results}


@router.get("/teacher/me")
async def get_my_teacher_timetable(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, user = ctx
    _require_permission(user, "viewTimetable")

    if user["role"] != "teacher":
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "Only teachers can access this endpoint.",
            "FORBIDDEN",
        )

    resolved_term = await _resolve_term_id(conn, school_id, term_id)
    rows = await fetch_period_rows(
        conn,
        school_id,
        teacher_id=user["user_db_id"],
        term_id=resolved_term,
    )
    return {"data": _serialize_grid(None, resolved_term, rows)}


@router.get("/teacher/{teacher_id}")
async def get_teacher_timetable(
    teacher_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, user = ctx
    _require_permission(user, "viewTimetable")

    if user["role"] == "teacher":
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "You cannot view another teacher's timetable.",
            "FORBIDDEN",
        )

    resolved_term = await _resolve_term_id(conn, school_id, term_id)
    rows = await fetch_period_rows(
        conn,
        school_id,
        teacher_id=teacher_id,
        term_id=resolved_term,
    )
    return {"data": _serialize_grid(None, resolved_term, rows)}


@router.get("/class/{class_id}")
async def get_class_timetable(
    class_id: uuid.UUID,
    ctx: Ctx,
    allowed_class_ids: AllowedClassIds,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, user = ctx
    _require_permission(user, "viewTimetable")

    if not assert_class_access(allowed_class_ids, class_id):
        raise _error(status.HTTP_403_FORBIDDEN, "You cannot view this class timetable.", "FORBIDDEN")

    resolved_term = await _resolve_term_id(conn, school_id, term_id)
    rows = await fetch_period_rows(
        conn,
        school_id,
        class_id=class_id,
        term_id=resolved_term,
    )
    return {"data": _serialize_grid(class_id, resolved_term, rows)}


@router.delete("/class/{class_id}", status_code=status.HTTP_200_OK)
async def clear_class_timetable(
    class_id: uuid.UUID,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, user = ctx
    _require_permission(user, "manageTimetable")

    class_row = await conn.fetchrow(
        "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        class_id,
        school_id,
    )
    if not class_row:
        raise _error(status.HTTP_404_NOT_FOUND, "Class not found.", "NOT_FOUND")

    resolved_term = await _resolve_term_id(conn, school_id, term_id)
    await conn.execute(
        """
        DELETE FROM timetable_periods
        WHERE school_id = $1 AND class_id = $2
          AND term_id IS NOT DISTINCT FROM $3::uuid
        """,
        school_id,
        class_id,
        resolved_term,
    )
    return {"data": _serialize_grid(class_id, resolved_term, [])}
