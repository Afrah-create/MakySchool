"""Learner portal APIs — parents and learners share the same linked student account."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.pool import get_db
from app.lib.storage_urls import enrich_student_media
from app.lib.teacher_assignments import format_class_name, get_current_term_id
from app.lib.timetable.conflicts import fetch_period_rows
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.students.accounts import resolve_student_for_user
from fastapi.encoders import jsonable_encoder

router = APIRouter()

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


def _require_learner(actor: dict[str, Any]) -> uuid.UUID:
    role = (actor.get("role") or "").lower()
    if role not in ("learner", "student"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Learner portal access only.", "code": "FORBIDDEN"},
        )
    try:
        return uuid.UUID(str(actor["sub"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid session.", "code": "UNAUTHORIZED"},
        ) from exc


async def _linked_student(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
) -> asyncpg.Record:
    student = await resolve_student_for_user(conn, school_id=school_id, user_id=user_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "No learner profile is linked to this account. Contact your school.",
                "code": "LEARNER_NOT_LINKED",
            },
        )
    return student


def _serialize_timetable_period(row: asyncpg.Record) -> dict[str, Any]:
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


@router.get("/me")
async def learner_me(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    user_id = _require_learner(actor)
    student = await _linked_student(conn, school_id, user_id)

    guardian = await conn.fetchrow(
        """
        SELECT id, full_name, phone, email, relationship, is_primary
        FROM student_guardians
        WHERE student_id = $1 AND school_id = $2 AND is_primary = true
        LIMIT 1
        """,
        student["id"],
        school_id,
    )

    class_name = (
        format_class_name(student["level"], student["stream"]) if student["level"] else None
    )

    # Lightweight fee summary for dashboard
    fee_row = await conn.fetchrow(
        """
        SELECT
          COALESCE(SUM(balance), 0)::bigint AS total_balance,
          COALESCE(SUM(amount_paid), 0)::bigint AS total_paid,
          COALESCE(SUM(amount_owed), 0)::bigint AS total_owed,
          COUNT(*)::int AS account_count
        FROM student_fee_accounts
        WHERE student_id = $1 AND school_id = $2 AND status <> 'waived'
        """,
        student["id"],
        school_id,
    )

    payload = {
        "id": str(student["id"]),
        "learner_id": student["learner_id"],
        "full_name": student["full_name"],
        "date_of_birth": student["date_of_birth"].isoformat() if student["date_of_birth"] else None,
        "gender": student["gender"],
        "photo_url": student["photo_url"],
        "status": student["status"],
        "class_id": str(student["current_class_id"]) if student["current_class_id"] else None,
        "class_name": class_name,
        "guardian": (
            {
                "id": str(guardian["id"]),
                "full_name": guardian["full_name"],
                "phone": guardian["phone"],
                "email": guardian["email"],
                "relationship": guardian["relationship"],
            }
            if guardian
            else None
        ),
        "fees": {
            "total_balance": int(fee_row["total_balance"]) if fee_row else 0,
            "total_paid": int(fee_row["total_paid"]) if fee_row else 0,
            "total_owed": int(fee_row["total_owed"]) if fee_row else 0,
            "account_count": int(fee_row["account_count"]) if fee_row else 0,
        },
    }

    return {"data": await enrich_student_media(payload, school_id)}


@router.get("/fees")
async def learner_fees(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    user_id = _require_learner(actor)
    student = await _linked_student(conn, school_id, user_id)
    student_id = student["id"]

    accounts = await conn.fetch(
        """
        SELECT
          sfa.*,
          fs.term_name,
          fs.academic_year,
          sc.level,
          sc.stream
        FROM student_fee_accounts sfa
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN school_classes sc ON sc.id = fs.class_id
        WHERE sfa.student_id = $1 AND sfa.school_id = $2
        ORDER BY fs.academic_year DESC, fs.term_name
        """,
        student_id,
        school_id,
    )

    account_ids = [row["id"] for row in accounts]
    payments_by_account: dict[uuid.UUID, list[dict]] = {}
    if account_ids:
        payment_rows = await conn.fetch(
            """
            SELECT id, fee_account_id, receipt_number, amount, payment_date, payment_method, voided
            FROM fee_payments
            WHERE fee_account_id = ANY($1::uuid[]) AND school_id = $2
            ORDER BY payment_date DESC, created_at DESC
            """,
            account_ids,
            school_id,
        )
        for row in payment_rows:
            payments_by_account.setdefault(row["fee_account_id"], []).append(
                {
                    "id": str(row["id"]),
                    "receipt_number": row["receipt_number"],
                    "amount": int(row["amount"]),
                    "payment_date": row["payment_date"],
                    "payment_method": row["payment_method"],
                    "voided": row["voided"],
                }
            )

    return {
        "data": {
            "accounts": [
                {
                    "id": str(row["id"]),
                    "fee_structure_id": str(row["fee_structure_id"]),
                    "term_name": row["term_name"],
                    "academic_year": row["academic_year"],
                    "class_name": format_class_name(row["level"] or "", row["stream"]),
                    "amount_owed": int(row["amount_owed"]),
                    "amount_paid": int(row["amount_paid"]),
                    "balance": int(row["balance"]),
                    "status": row["status"],
                    "payments": payments_by_account.get(row["id"], []),
                }
                for row in accounts
            ]
        }
    }


@router.get("/invoices")
async def learner_invoices(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    user_id = _require_learner(actor)
    student = await _linked_student(conn, school_id, user_id)

    from app.services.fees import invoices as invoice_service

    invoices = await invoice_service.list_student_invoices(conn, school_id, student["id"])
    return {"data": {"invoices": jsonable_encoder(invoices)}}


@router.get("/attendance")
async def learner_attendance_redirect_info(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None),
):
    """Return the linked student id so the client can load the attendance dossier."""
    school_id, actor = ctx
    user_id = _require_learner(actor)
    student = await _linked_student(conn, school_id, user_id)
    return {
        "data": {
            "studentId": str(student["id"]),
            "learnerId": student["learner_id"],
            "termId": str(term_id) if term_id else None,
        }
    }


@router.get("/timetable")
async def learner_timetable(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID | None = Query(None, alias="termId"),
):
    school_id, actor = ctx
    user_id = _require_learner(actor)
    student = await _linked_student(conn, school_id, user_id)

    class_id = student["current_class_id"]
    class_name = (
        format_class_name(student["level"], student["stream"]) if student["level"] else None
    )

    if not class_id:
        return {
            "data": {
                "classId": None,
                "className": None,
                "termId": None,
                "periods": [],
            }
        }

    resolved_term = term_id if term_id is not None else await get_current_term_id(conn, school_id)
    rows = await fetch_period_rows(
        conn,
        school_id,
        class_id=class_id,
        term_id=resolved_term,
    )

    return {
        "data": jsonable_encoder(
            {
                "classId": str(class_id),
                "className": class_name,
                "termId": str(resolved_term) if resolved_term else None,
                "periods": [_serialize_timetable_period(row) for row in rows],
            }
        )
    }
