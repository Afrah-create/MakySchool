from __future__ import annotations

import secrets
import uuid
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.lib.password import hash_password
from pydantic import BaseModel, EmailStr

from app.db.pool import get_db
from app.lib.slug import slugify_school_name
from app.lib.user_sql import USER_ADMIN_ROLE_SQL, USER_DISPLAY_NAME_SQL, USER_LEARNER_ROLE_SQL, USER_TEACHER_ROLE_SQL
from app.middleware.auth import get_current_superadmin

router = APIRouter(dependencies=[Depends(get_current_superadmin)])

async def _generate_unique_slug(conn: asyncpg.Connection, name: str) -> str:
    base_slug = slugify_school_name(name)
    suffix = 1
    candidate = base_slug
    while True:
        existing = await conn.fetchrow(
            "SELECT 1 FROM schools WHERE slug = $1 LIMIT 1",
            candidate,
        )
        if not existing:
            return candidate
        suffix += 1
        candidate = f"{base_slug}-{suffix}"


class CreateSchoolBody(BaseModel):
    schoolName: str | None = None
    adminName: str | None = None
    adminEmail: EmailStr | None = None


class PatchStatusBody(BaseModel):
    status: str | None = None


class PatchSchoolBody(BaseModel):
    name: str | None = None
    slug: str | None = None
    schoolType: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    subscriptionStatus: str | None = None
    subscriptionTerm: str | None = None
    subscriptionYear: int | None = None
    schoolpayCode: str | None = None
    adminName: str | None = None
    adminEmail: EmailStr | None = None


class ManualSubscriptionBody(BaseModel):
    amount: int | None = None
    term: str | None = None
    year: int | None = None
    schoolpayRef: str | None = None


@router.get("")
async def list_schools(
    search: str = Query(""),
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_db),
):
    offset = (page - 1) * limit
    where: list[str] = []
    params: list[Any] = []

    if search.strip():
        params.append(f"%{search.strip()}%")
        where.append(f"(s.name ILIKE ${len(params)} OR s.slug ILIKE ${len(params)})")

    if status_filter.strip():
        params.append(status_filter.strip())
        where.append(f"s.status = ${len(params)}")

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    count_params = list(params)
    params.extend([limit, offset])

    rows = await conn.fetch(
        f"""
        SELECT
          s.id,
          s.name,
          s.slug,
          s.status,
          s.subscription_status,
          s.school_type,
          s.created_at,
          COALESCE(u.email, '') AS admin_email,
          (SELECT COUNT(*)::int FROM users u2 WHERE u2.school_id = s.id) AS user_count
        FROM schools s
        LEFT JOIN LATERAL (
          SELECT email FROM users u
          WHERE u.school_id = s.id AND {USER_ADMIN_ROLE_SQL}
          ORDER BY u.created_at ASC LIMIT 1
        ) u ON true
        {where_sql}
        ORDER BY s.created_at DESC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """,
        *params,
    )

    count_row = await conn.fetchrow(
        f"SELECT COUNT(*)::text AS count FROM schools s {where_sql}",
        *count_params,
    )

    stats_params: list[Any] = []
    stats_where = ""
    if status_filter.strip():
        stats_where = "WHERE s.status = $1"
        stats_params.append(status_filter.strip())

    stats = await conn.fetchrow(
        f"""
        SELECT
          COUNT(*)::int AS total_schools,
          COUNT(*) FILTER (WHERE s.status = 'active')::int AS active_schools,
          COUNT(*) FILTER (WHERE s.status = 'setup')::int AS setup_schools,
          COALESCE(SUM(sp.amount) FILTER (WHERE sp.status = 'completed'), 0)::int AS revenue_current_term
        FROM schools s
        LEFT JOIN subscription_payments sp ON sp.school_id = s.id
        {stats_where}
        """,
        *stats_params,
    )

    return {
        "data": {
            "items": [dict(r) for r in rows],
            "page": page,
            "limit": limit,
            "total": int(count_row["count"]) if count_row else 0,
            "stats": dict(stats) if stats else {},
        }
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_school(
    body: CreateSchoolBody,
    conn: asyncpg.Connection = Depends(get_db),
):
    if not body.schoolName or not body.adminName or not body.adminEmail:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "School name, admin name, and admin email are required"},
        )

    normalized_admin_email = str(body.adminEmail).lower().strip()
    existing_email = await conn.fetchrow(
        """
        SELECT 1 FROM users
        WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL
        LIMIT 1
        """,
        normalized_admin_email,
    )
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "Admin email is already in use for a school account"},
        )

    school_id = uuid.uuid4()
    temp_password = secrets.token_hex(10)
    slug = await _generate_unique_slug(conn, body.schoolName)
    password_hash = hash_password(temp_password)

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO schools (id, slug, name, status, subscription_status)
            VALUES ($1, $2, $3, 'setup', 'unpaid')
            """,
            school_id,
            slug,
            body.schoolName.strip(),
        )
        await conn.execute(
            """
            INSERT INTO users (
              id, school_id, email, password_hash, full_name, name, role, account_status,
              is_temp_password, setup_completed
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, 'ADMIN', 'ACTIVE', true, false)
            """,
            school_id,
            normalized_admin_email,
            password_hash,
            body.adminName.strip(),
        )

    return {
        "data": {
            "school": {
                "id": str(school_id),
                "slug": slug,
                "name": body.schoolName,
                "status": "setup",
            },
            "admin": {"email": normalized_admin_email},
            "tempPassword": temp_password,
        }
    }


@router.get("/{school_id}")
async def get_school(
    school_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    school = await conn.fetchrow("SELECT * FROM schools WHERE id = $1 LIMIT 1", school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "School not found"})

    subscription_history = await conn.fetch(
        """
        SELECT id, amount, term, year, schoolpay_ref, paid_at
        FROM subscription_payments WHERE school_id = $1 ORDER BY paid_at DESC
        """,
        school_id,
    )
    counts = await conn.fetchrow(
        f"""
        SELECT
          (SELECT COUNT(*)::int FROM school_classes WHERE school_id = $1) AS classes,
          (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND {USER_TEACHER_ROLE_SQL}) AS teachers,
          (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND {USER_LEARNER_ROLE_SQL}) AS students
        """,
        school_id,
    )
    year_count = await conn.fetchval(
        "SELECT COUNT(*)::int FROM academic_years WHERE school_id = $1",
        school_id,
    )
    grading_count = await conn.fetchval(
        "SELECT COUNT(*)::int FROM grading_scales WHERE school_id = $1",
        school_id,
    )
    admin = await conn.fetchrow(
        f"""
        SELECT u.id, u.email, {USER_DISPLAY_NAME_SQL} AS name
        FROM users u
        WHERE u.school_id = $1 AND {USER_ADMIN_ROLE_SQL}
        ORDER BY u.created_at ASC
        LIMIT 1
        """,
        school_id,
    )

    return {
        "data": {
            "school": dict(school),
            "admin": dict(admin) if admin else None,
            "subscriptionHistory": [dict(r) for r in subscription_history],
            "counts": dict(counts) if counts else {"classes": 0, "teachers": 0, "students": 0},
            "setupStatus": {
                "profileComplete": bool(school["name"] and school.get("school_type")),
                "academicYearComplete": int(year_count or 0) > 0,
                "gradingScaleComplete": int(grading_count or 0) > 0,
            },
        }
    }


@router.patch("/{school_id}/status")
async def patch_school_status(
    school_id: uuid.UUID,
    body: PatchStatusBody,
    conn: asyncpg.Connection = Depends(get_db),
):
    if body.status not in ("active", "suspended"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Valid status is required"},
        )

    if body.status == "active":
        current = await conn.fetchrow(
            "SELECT status FROM schools WHERE id = $1 LIMIT 1",
            school_id,
        )
        if current and current["status"] == "setup":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "School must complete setup before activation",
                    "code": "SETUP_INCOMPLETE",
                },
            )

    updated = await conn.fetchrow(
        "UPDATE schools SET status = $1 WHERE id = $2 RETURNING id, status",
        body.status,
        school_id,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "School not found"})
    return {"data": dict(updated)}


@router.patch("/{school_id}")
async def patch_school(
    school_id: uuid.UUID,
    body: PatchSchoolBody,
    conn: asyncpg.Connection = Depends(get_db),
):
    school = await conn.fetchrow("SELECT id FROM schools WHERE id = $1 LIMIT 1", school_id)
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "School not found"})

    if body.slug and body.slug.strip():
        normalized_slug = slugify_school_name(body.slug)
        conflict = await conn.fetchrow(
            "SELECT 1 FROM schools WHERE slug = $1 AND id <> $2 LIMIT 1",
            normalized_slug,
            school_id,
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "Another school already uses this slug"},
            )

    if body.adminEmail and str(body.adminEmail).strip():
        normalized_admin_email = str(body.adminEmail).lower().strip()
        conflict = await conn.fetchrow(
            """
            SELECT 1 FROM users
            WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL AND school_id <> $2
            LIMIT 1
            """,
            normalized_admin_email,
            school_id,
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "Admin email is already in use for another school"},
            )

    if body.subscriptionStatus and body.subscriptionStatus not in ("unpaid", "active", "expired"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Invalid subscription status"},
        )

    schoolpay_provided = body.schoolpayCode is not None

    async with conn.transaction():
        updated = await conn.fetchrow(
            """
            UPDATE schools
            SET name = COALESCE($1, name),
                slug = COALESCE($2, slug),
                school_type = COALESCE($3, school_type),
                email = COALESCE($4, email),
                phone = COALESCE($5, phone),
                address = COALESCE($6, address),
                subscription_status = COALESCE($7, subscription_status),
                subscription_term = COALESCE($8, subscription_term),
                subscription_year = COALESCE($9, subscription_year),
                schoolpay_code = CASE WHEN $10::boolean THEN $11 ELSE schoolpay_code END
            WHERE id = $12
            RETURNING *
            """,
            body.name.strip() if body.name else None,
            slugify_school_name(body.slug) if body.slug and body.slug.strip() else None,
            body.schoolType.strip() if body.schoolType else None,
            body.email.strip() if body.email else None,
            body.phone.strip() if body.phone else None,
            body.address.strip() if body.address else None,
            body.subscriptionStatus,
            body.subscriptionTerm.strip() if body.subscriptionTerm else None,
            body.subscriptionYear,
            schoolpay_provided,
            body.schoolpayCode.strip() if body.schoolpayCode else None,
            school_id,
        )

        if (body.adminName and body.adminName.strip()) or (body.adminEmail and str(body.adminEmail).strip()):
            await conn.execute(
                f"""
                UPDATE users u
                SET name = COALESCE($1, u.name),
                    full_name = COALESCE($1, u.full_name),
                    email = COALESCE($2, u.email)
                WHERE u.school_id = $3 AND {USER_ADMIN_ROLE_SQL}
                """,
                body.adminName.strip() if body.adminName else None,
                str(body.adminEmail).lower().strip() if body.adminEmail else None,
                school_id,
            )

    admin = await conn.fetchrow(
        f"""
        SELECT u.id, u.email, {USER_DISPLAY_NAME_SQL} AS name
        FROM users u
        WHERE u.school_id = $1 AND {USER_ADMIN_ROLE_SQL}
        ORDER BY u.created_at ASC
        LIMIT 1
        """,
        school_id,
    )

    return {
        "data": {
            "school": dict(updated),
            "admin": dict(admin) if admin else None,
        }
    }


@router.delete("/{school_id}")
async def delete_school(
    school_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    deleted = await conn.fetchrow(
        "DELETE FROM schools WHERE id = $1 RETURNING id, name",
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "School not found"})
    return {"data": {"id": str(deleted["id"]), "name": deleted["name"]}}


@router.post("/{school_id}/subscription", status_code=status.HTTP_201_CREATED)
async def record_manual_subscription(
    school_id: uuid.UUID,
    body: ManualSubscriptionBody,
    conn: asyncpg.Connection = Depends(get_db),
):
    if not body.amount or not body.term or not body.year:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Amount, term, and year are required"},
        )

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO subscription_payments (id, school_id, amount, term, year, schoolpay_ref)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
            """,
            school_id,
            body.amount,
            body.term,
            body.year,
            body.schoolpayRef,
        )
        await conn.execute(
            """
            UPDATE schools
            SET subscription_status = 'active', subscription_term = $1, subscription_year = $2
            WHERE id = $3
            """,
            body.term,
            body.year,
            school_id,
        )

    return {"data": {"ok": True}}
