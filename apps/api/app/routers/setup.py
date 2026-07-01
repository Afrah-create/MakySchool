import uuid
from datetime import date
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.config import settings
from app.db.pool import get_db
from app.lib.jwt_utils import (
    ACCESS_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES_MS,
    cookie_options,
    sign_tenant_token,
)
from app.lib.uploads import save_school_image
from app.lib.user_sql import USER_ADMIN_ROLE_SQL, USER_DISPLAY_NAME_SQL, normalize_user_role
from app.middleware.tenant import get_tenant_and_user
from app.services.subscription import audit_school_subscription

router = APIRouter()


class TermInput(BaseModel):
    name: str | None = None
    startDate: date | None = None
    endDate: date | None = None


class AcademicYearInput(BaseModel):
    year: int
    terms: list[TermInput]


class GradingBandInput(BaseModel):
    label: str | None = None
    minScore: float | int | None = None
    maxScore: float | int | None = None
    description: str | None = None


Ctx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(get_tenant_and_user)]


def _row(row: asyncpg.Record | None) -> Any:
    if row is None:
        return None
    return jsonable_encoder(dict(row))


@router.get("/status")
async def get_setup_status(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

    await audit_school_subscription(conn, school_id)

    school = await conn.fetchrow(
        """
        SELECT id, slug, name, logo_url, stamp_url, email, phone, address, school_type,
               status, subscription_status, subscription_term, subscription_year,
               schoolpay_code, setup_completed_at, created_at
        FROM schools WHERE id = $1
        """,
        school_id,
    )
    year_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1",
        school_id,
    )
    grading_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1",
        school_id,
    )

    profile = bool(school and school.get("name") and school.get("school_type"))
    academic_year = int(year_row["count"] if year_row else 0) > 0
    grading_scale = int(grading_row["count"] if grading_row else 0) > 0
    completed = bool(school and school.get("setup_completed_at"))

    return {
        "data": {
            "profile": profile,
            "academic_year": academic_year,
            "grading_scale": grading_scale,
            "completed": completed,
            "school": _row(school),
        }
    }


async def _save_profile(
    *,
    school_id: uuid.UUID,
    conn: asyncpg.Connection,
    name: str | None,
    email: str | None,
    phone: str | None,
    address: str | None,
    school_type: str | None,
    logo: UploadFile | None,
    stamp: UploadFile | None,
):
    logo_url = await save_school_image(school_id, logo) if logo and logo.filename else None
    stamp_url = await save_school_image(school_id, stamp) if stamp and stamp.filename else None

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
        name,
        logo_url,
        stamp_url,
        email,
        phone,
        address,
        school_type,
        school_id,
    )
    return {"data": _row(row)}


@router.post("/profile")
async def post_profile(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
    name: str | None = Form(None),
    email: str | None = Form(None),
    phone: str | None = Form(None),
    address: str | None = Form(None),
    school_type: str | None = Form(None),
    logo: UploadFile | None = File(None),
    stamp: UploadFile | None = File(None),
):
    school_id, _user = ctx
    return await _save_profile(
        school_id=school_id,
        conn=conn,
        name=name,
        email=email,
        phone=phone,
        address=address,
        school_type=school_type,
        logo=logo,
        stamp=stamp,
    )


@router.patch("/profile")
async def patch_profile(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
    name: str | None = Form(None),
    email: str | None = Form(None),
    phone: str | None = Form(None),
    address: str | None = Form(None),
    school_type: str | None = Form(None),
    logo: UploadFile | None = File(None),
    stamp: UploadFile | None = File(None),
):
    school_id, _user = ctx
    return await _save_profile(
        school_id=school_id,
        conn=conn,
        name=name,
        email=email,
        phone=phone,
        address=address,
        school_type=school_type,
        logo=logo,
        stamp=stamp,
    )


@router.post("/academic-year", status_code=status.HTTP_201_CREATED)
async def create_academic_year(
    body: AcademicYearInput,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

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


@router.post("/grading-scale", status_code=status.HTTP_201_CREATED)
async def create_grading_scale(
    body: list[GradingBandInput],
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _user = ctx

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


@router.post("/complete")
async def complete_setup(
    response: Response,
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx

    school = await conn.fetchrow(
        "SELECT name, school_type FROM schools WHERE id = $1",
        school_id,
    )
    year_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1",
        school_id,
    )
    grading_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1",
        school_id,
    )

    if not school or not school["name"] or not school["school_type"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "School profile is incomplete", "code": "PROFILE_INCOMPLETE"},
        )

    if int(year_row["count"] if year_row else 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Academic year is not configured", "code": "ACADEMIC_YEAR_INCOMPLETE"},
        )

    if int(grading_row["count"] if grading_row else 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Grading scale is not configured", "code": "GRADING_INCOMPLETE"},
        )

    async with conn.transaction():
        updated = await conn.fetchrow(
            """
            UPDATE schools
            SET status = 'active', setup_completed_at = NOW()
            WHERE id = $1 AND status = 'setup'
            RETURNING *
            """,
            school_id,
        )

        if not updated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "School setup is already complete", "code": "ALREADY_ACTIVE"},
            )

        await conn.execute(
            f"""
            UPDATE users u
            SET setup_completed = true, updated_at = NOW()
            WHERE u.school_id = $1 AND {USER_ADMIN_ROLE_SQL}
            """,
            school_id,
        )

    user_row = await conn.fetchrow(
        f"""
        SELECT
           u.email,
           {USER_DISPLAY_NAME_SQL} AS name,
           u.role,
           s.slug AS school_slug
        FROM users u
        INNER JOIN schools s ON s.id = u.school_id
        WHERE u.id = $1
        LIMIT 1
        """,
        uuid.UUID(str(user["sub"])),
    )

    if user_row:
        normalized_role = normalize_user_role(user_row["role"])
        payload = {
            "sub": str(user["sub"]),
            "email": user_row["email"],
            "name": user_row["name"],
            "role": normalized_role,
            "schoolId": str(school_id),
            "schoolSlug": user_row["school_slug"],
            "mustChangePassword": False,
            "setupCompleted": True,
        }
        response.set_cookie(
            settings.TENANT_ACCESS_COOKIE,
            sign_tenant_token(payload, ACCESS_TOKEN_EXPIRES),
            **cookie_options(20 * 60 * 1000),
        )
        response.set_cookie(
            settings.TENANT_REFRESH_COOKIE,
            sign_tenant_token(payload, REFRESH_TOKEN_EXPIRES),
            **cookie_options(REFRESH_TOKEN_EXPIRES_MS),
        )

    return {"data": _row(updated)}
