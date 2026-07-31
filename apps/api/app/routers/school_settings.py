from __future__ import annotations

import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.permissions import can
from app.lib.uploads import delete_stored_object, save_school_image
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.routers.setup import AcademicYearInput, GradingBandInput, _row
from app.services.schools.settings_service import fetch_school_settings, update_student_id_settings

router = APIRouter()

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class StudentIdSettingsBody(BaseModel):
    prefix: str | None = None
    suffixLength: int | None = Field(default=None, ge=4, le=10)
    mode: str | None = None


def _require_manage_school(actor: dict[str, Any]) -> None:
    if not can(actor["role"], "manageSchool"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage school settings.",
                "code": "FORBIDDEN",
            },
        )

@router.get("/current-term")
async def get_current_term(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    # No _require_manage_school here — any authenticated tenant role
    # (teacher, admin, head_teacher, bursar) needs to know the current term.
    row = await conn.fetchrow(
        """
        SELECT id, name, start_date, end_date, is_current, academic_year_id
        FROM terms
        WHERE school_id = $1
        ORDER BY
          is_current DESC,
          (start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE) DESC,
          start_date DESC NULLS LAST
        LIMIT 1
        """,
        school_id,
    )
    if not row:
        return {"data": None}
    return {
        "data": {
            "id": str(row["id"]),
            "name": row["name"],
            "startDate": row["start_date"].isoformat() if row["start_date"] else None,
            "endDate": row["end_date"].isoformat() if row["end_date"] else None,
            "isCurrent": row["is_current"],
            "academicYearId": str(row["academic_year_id"]) if row["academic_year_id"] else None,
        }
    }


@router.get("")
async def get_settings(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_manage_school(actor)
    return {"data": await fetch_school_settings(conn, school_id)}


@router.patch("/profile")
async def patch_profile(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    name: str | None = Form(None),
    email: str | None = Form(None),
    phone: str | None = Form(None),
    address: str | None = Form(None),
    school_type: str | None = Form(None),
    logo: UploadFile | None = File(None),
    stamp: UploadFile | None = File(None),
):
    school_id, actor = ctx
    _require_manage_school(actor)

    if school_type and school_type not in ("primary", "secondary", "both"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Invalid school type.", "code": "VALIDATION_ERROR"},
        )

    current = await conn.fetchrow(
        "SELECT logo_url, stamp_url FROM schools WHERE id = $1",
        school_id,
    )

    logo_key = None
    stamp_key = None
    if logo and logo.filename:
        logo_key = await save_school_image(school_id, logo, category="logo")
        if current and current["logo_url"]:
            await delete_stored_object(school_id, current["logo_url"])
    if stamp and stamp.filename:
        stamp_key = await save_school_image(school_id, stamp, category="stamp")
        if current and current["stamp_url"]:
            await delete_stored_object(school_id, current["stamp_url"])

    row = await conn.fetchrow(
        """
        UPDATE schools
        SET name = COALESCE($1, name),
            logo_url = COALESCE($2, logo_url),
            stamp_url = COALESCE($3, stamp_url),
            email = COALESCE($4, email),
            phone = COALESCE($5, phone),
            address = COALESCE($6, address),
            school_type = COALESCE($7, school_type)
        WHERE id = $8
        RETURNING *
        """,
        name.strip() if name else None,
        logo_key,
        stamp_key,
        email.strip() if email else None,
        phone.strip() if phone else None,
        address.strip() if address else None,
        school_type,
        school_id,
    )

    from app.lib.storage_urls import enrich_school_media

    payload = _row(row)
    if isinstance(payload, dict):
        payload = await enrich_school_media(payload, school_id)
    return {"data": payload}


@router.put("/academic-year")
async def update_academic_year(
    body: AcademicYearInput,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_manage_school(actor)

    if not body.year or not body.terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Year and terms are required"},
        )

    async with conn.transaction():
        await conn.execute(
            "UPDATE academic_years SET is_current = false WHERE school_id = $1",
            school_id,
        )

        academic_year_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO academic_years (id, school_id, year, is_current)
            VALUES ($1, $2, $3, true)
            """,
            academic_year_id,
            school_id,
            body.year,
        )

        await conn.execute("DELETE FROM terms WHERE school_id = $1", school_id)

        for term in body.terms:
            await conn.execute(
                """
                INSERT INTO terms (id, school_id, academic_year_id, name, start_date, end_date, is_current)
                VALUES ($1, $2, $3, $4, $5, $6, false)
                """,
                uuid.uuid4(),
                school_id,
                academic_year_id,
                term.name or "",
                term.startDate,
                term.endDate,
            )

    return {"data": {"id": str(academic_year_id)}}


@router.put("/grading-scale")
async def update_grading_scale(
    body: list[GradingBandInput],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_manage_school(actor)

    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "At least one grading band is required"},
        )

    async with conn.transaction():
        await conn.execute("DELETE FROM grading_scales WHERE school_id = $1", school_id)
        for band in body:
            await conn.execute(
                """
                INSERT INTO grading_scales (id, school_id, label, min_score, max_score, description)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                uuid.uuid4(),
                school_id,
                band.label or "",
                band.minScore if band.minScore is not None else 0,
                band.maxScore if band.maxScore is not None else 0,
                band.description,
            )

    return {"data": {"ok": True}}


@router.patch("/student-ids")
async def patch_student_id_settings(
    body: StudentIdSettingsBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_manage_school(actor)

    try:
        updated = await update_student_id_settings(
            conn,
            school_id,
            prefix=body.prefix,
            suffix_length=body.suffixLength,
            mode=body.mode,
        )
    except ValueError as exc:
        message = exc.args[0]
        if isinstance(message, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "Validation failed.",
                    "code": "VALIDATION_ERROR",
                    "fields": message,
                },
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": str(message), "code": "VALIDATION_ERROR"},
        ) from exc

    return {"data": updated}
