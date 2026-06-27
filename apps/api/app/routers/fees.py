from __future__ import annotations

import uuid
from datetime import date
import logging
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.db.pool import get_db, get_pool
from app.lib.pdf import ReceiptNotFoundError, generate_fee_receipt_pdf
from app.lib.rate_limit import get_school_key, limiter
from app.lib.receipt import format_class_name, format_ugx, generate_receipt_number
from app.middleware.tenant import get_tenant_and_user
from app.routers.fees_shared import (
    PAYMENT_METHODS,
    fees_error as _error,
    fees_actor_id,
    parse_payment_date,
    parse_uuid,
    record_fee_payment as _record_fee_payment,
    recalculate_fee_account as _recalculate_fee_account,
    require_fees_permission as _require_permission,
)

router = APIRouter()
logger = logging.getLogger("makyschool")


class FeeStructureCreate(BaseModel):
    class_id: str | None = None
    term_name: str | None = None
    academic_year: int | None = None
    amount: int | None = None
    description: str | None = None


class FeeStructurePatch(BaseModel):
    amount: int | None = None
    description: str | None = None
    is_active: bool | None = None


class PaymentCreate(BaseModel):
    student_id: str | None = None
    fee_structure_id: str | None = None
    amount: int | None = None
    payment_method: str = "cash"
    payment_reference: str | None = None
    payment_date: str | None = None
    notes: str | None = None


class BulkPaymentLine(BaseModel):
    student_id: str
    fee_structure_id: str
    amount: int


class BulkPaymentCreate(BaseModel):
    payments: list[BulkPaymentLine]
    payment_method: str = "cash"
    payment_reference: str | None = None
    payment_date: str | None = None
    notes: str | None = None


class VoidPaymentBody(BaseModel):
    reason: str | None = None


class WaiveAccountBody(BaseModel):
    reason: str | None = None


class SmsReminderBody(BaseModel):
    class_id: str | None = None
    term_name: str | None = None
    academic_year: int | None = None
    message: str | None = None


@router.get("/structures")
async def list_structures(
    academic_year: int | None = Query(None),
    term_name: str | None = Query(None),
    class_id: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")

    conditions = ["fs.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2

    if academic_year is not None:
        conditions.append(f"fs.academic_year = ${idx}")
        params.append(academic_year)
        idx += 1
    if term_name:
        conditions.append(f"fs.term_name = ${idx}")
        params.append(term_name)
        idx += 1
    if class_id:
        conditions.append(f"fs.class_id = ${idx}")
        params.append(uuid.UUID(class_id))
        idx += 1

    rows = await conn.fetch(
        f"""
        SELECT
          fs.*,
          sc.level,
          sc.stream,
          sc.level || COALESCE(sc.stream, '') AS class_name,
          COUNT(sfa.id)::int AS student_count,
          COALESCE(SUM(sfa.amount_owed), 0)::bigint AS total_owed,
          COALESCE(SUM(sfa.amount_paid), 0)::bigint AS total_collected,
          COALESCE(SUM(sfa.balance), 0)::bigint AS total_outstanding
        FROM fee_structures fs
        JOIN school_classes sc ON sc.id = fs.class_id
        LEFT JOIN student_fee_accounts sfa ON sfa.fee_structure_id = fs.id
        WHERE {" AND ".join(conditions)}
        GROUP BY fs.id, sc.level, sc.stream
        ORDER BY fs.academic_year DESC, fs.term_name, sc.level
        """,
        *params,
    )
    return {"data": [dict(r) for r in rows]}


@router.post("/structures", status_code=status.HTTP_201_CREATED)
async def create_structure(
    body: FeeStructureCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageFees")

    fields: dict[str, str] = {}
    if not body.class_id:
        fields["class_id"] = "Class is required."
    if not body.term_name or not body.term_name.strip():
        fields["term_name"] = "Term name is required."
    if body.academic_year is None or not isinstance(body.academic_year, int):
        fields["academic_year"] = "Academic year is required."
    if body.amount is None or not isinstance(body.amount, int) or body.amount <= 0:
        fields["amount"] = "Amount must be a positive whole number."
    if fields:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Please fix the highlighted fields.",
            "VALIDATION_ERROR",
            fields,
        )

    class_row = await conn.fetchrow(
        "SELECT level, stream FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        uuid.UUID(body.class_id),
        school_id,
    )
    if not class_row:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Class not found in your school.",
            "VALIDATION_ERROR",
            {"class_id": "Class not found in your school."},
        )

    term = body.term_name.strip()
    duplicate = await conn.fetchrow(
        """
        SELECT 1 FROM fee_structures
        WHERE school_id = $1 AND class_id = $2 AND term_name = $3 AND academic_year = $4
        LIMIT 1
        """,
        school_id,
        uuid.UUID(body.class_id),
        term,
        body.academic_year,
    )
    if duplicate:
        class_name = format_class_name(class_row["level"], class_row["stream"])
        raise _error(
            status.HTTP_409_CONFLICT,
            f"A fee structure for {class_name} in {term} already exists. Edit the existing one instead.",
            "CONFLICT",
        )

    row = await conn.fetchrow(
        """
        INSERT INTO fee_structures (
          school_id, class_id, term_name, academic_year, amount, description, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        school_id,
        uuid.UUID(body.class_id),
        term,
        body.academic_year,
        body.amount,
        body.description.strip() if body.description else None,
        uuid.UUID(str(user["sub"])),
    )
    return {"data": dict(row)}


@router.patch("/structures/{structure_id}")
async def patch_structure(
    structure_id: uuid.UUID,
    body: FeeStructurePatch,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageFees")

    existing = await conn.fetchrow(
        "SELECT * FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
        structure_id,
        school_id,
    )
    if not existing:
        raise _error(status.HTTP_404_NOT_FOUND, "Fee structure not found.", "NOT_FOUND")

    if body.amount is not None and (not isinstance(body.amount, int) or body.amount <= 0):
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Amount must be a positive whole number.",
            "VALIDATION_ERROR",
            {"amount": "Amount must be a positive whole number."},
        )

    updated = await conn.fetchrow(
        """
        UPDATE fee_structures
        SET amount = COALESCE($1, amount),
            description = COALESCE($2, description),
            is_active = COALESCE($3, is_active),
            updated_at = NOW()
        WHERE id = $4 AND school_id = $5
        RETURNING *
        """,
        body.amount,
        body.description if body.description is not None else None,
        body.is_active,
        structure_id,
        school_id,
    )

    count_row = await conn.fetchrow(
        "SELECT COUNT(*)::int AS count FROM student_fee_accounts WHERE fee_structure_id = $1",
        structure_id,
    )
    count = int(count_row["count"]) if count_row else 0
    amount_changed = body.amount is not None and body.amount != int(existing["amount"])

    payload: dict[str, Any] = {"fee_structure": dict(updated)}
    if amount_changed and count > 0:
        payload["warning"] = (
            f"Amount updated. {count} existing student fee accounts still use the old amount. "
            "Use 'Sync accounts' to update them."
        )
    return {"data": payload}


@router.post("/structures/{structure_id}/assign")
async def assign_structure(
    structure_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageFees")

    structure = await conn.fetchrow(
        "SELECT class_id, amount FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
        structure_id,
        school_id,
    )
    if not structure:
        raise _error(status.HTTP_404_NOT_FOUND, "Fee structure not found.", "NOT_FOUND")

    class_id = structure["class_id"]
    amount = int(structure["amount"])

    total_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS count FROM students
        WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
        """,
        school_id,
        class_id,
    )
    existing_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS count FROM student_fee_accounts sfa
        JOIN students s ON s.id = sfa.student_id
        WHERE sfa.fee_structure_id = $1 AND s.school_id = $2 AND s.current_class_id = $3 AND s.status = 'active'
        """,
        structure_id,
        school_id,
        class_id,
    )

    inserted = await conn.fetch(
        """
        INSERT INTO student_fee_accounts (school_id, student_id, fee_structure_id, amount_owed, status)
        SELECT $1, s.id, $2, $3, 'unpaid'
        FROM students s
        WHERE s.current_class_id = $4
          AND s.school_id = $1
          AND s.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM student_fee_accounts sfa
            WHERE sfa.student_id = s.id AND sfa.fee_structure_id = $2
          )
        RETURNING id
        """,
        school_id,
        structure_id,
        amount,
        class_id,
    )

    return {
        "data": {
            "assigned": len(inserted),
            "already_had_account": int(existing_row["count"]) if existing_row else 0,
            "total_students": int(total_row["count"]) if total_row else 0,
        }
    }


@router.post("/structures/{structure_id}/sync-accounts")
async def sync_accounts(
    structure_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageFees")

    structure = await conn.fetchrow(
        "SELECT amount FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
        structure_id,
        school_id,
    )
    if not structure:
        raise _error(status.HTTP_404_NOT_FOUND, "Fee structure not found.", "NOT_FOUND")

    amount = int(structure["amount"])
    updated = await conn.fetch(
        """
        UPDATE student_fee_accounts
        SET amount_owed = $1, updated_at = NOW()
        WHERE fee_structure_id = $2 AND school_id = $3 AND waived_by IS NULL
        RETURNING id
        """,
        amount,
        structure_id,
        school_id,
    )

    pool = await get_pool()
    for row in updated:
        async with pool.acquire() as account_conn:
            async with account_conn.transaction():
                await _recalculate_fee_account(account_conn, row["id"])

    return {"data": {"synced": len(updated)}}


@router.get("/payments")
async def list_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    student_id: str | None = Query(None),
    class_id: str | None = Query(None),
    term_name: str | None = Query(None),
    academic_year: int | None = Query(None),
    payment_method: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    payment_status: str | None = Query(None, alias="status"),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")

    offset = (page - 1) * limit
    conditions = ["fp.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2

    filters: list[tuple[str, Any]] = [
        ("student_id", uuid.UUID(student_id) if student_id else None),
        ("class_id", uuid.UUID(class_id) if class_id else None),
        ("term_name", term_name),
        ("academic_year", academic_year),
        ("payment_method", payment_method),
        ("date_from", date_from),
        ("date_to", date_to),
    ]

    for key, value in filters:
        if value is None:
            continue
        if key == "class_id":
            conditions.append(f"s.current_class_id = ${idx}")
        elif key == "term_name":
            conditions.append(f"fs.term_name = ${idx}")
        elif key == "academic_year":
            conditions.append(f"fs.academic_year = ${idx}")
        elif key == "student_id":
            conditions.append(f"fp.student_id = ${idx}")
        elif key == "payment_method":
            conditions.append(f"fp.payment_method = ${idx}")
        elif key == "date_from":
            conditions.append(f"fp.payment_date >= ${idx}")
        elif key == "date_to":
            conditions.append(f"fp.payment_date <= ${idx}")
        params.append(value)
        idx += 1

    if payment_status == "voided":
        conditions.append("fp.voided = true")
    elif payment_status == "active":
        conditions.append("fp.voided = false")

    where = " AND ".join(conditions)
    count_row = await conn.fetchrow(
        f"""
        SELECT COUNT(*)::int AS count
        FROM fee_payments fp
        JOIN students s ON s.id = fp.student_id
        JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE {where}
        """,
        *params,
    )

    list_params = [*params, limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
          fp.*,
          s.full_name AS student_name,
          s.learner_id,
          sc.level,
          sc.stream,
          fs.term_name,
          fs.academic_year,
          COALESCE(recorder.name, recorder.full_name) AS recorded_by_name
        FROM fee_payments fp
        JOIN students s ON s.id = fp.student_id
        JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN users recorder ON recorder.id = fp.recorded_by
        WHERE {where}
        ORDER BY fp.payment_date DESC, fp.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *list_params,
    )

    payments = []
    for row in rows:
        item = dict(row)
        item["class_name"] = format_class_name(item.get("level") or "", item.get("stream"))
        payments.append(item)

    return {
        "data": {
            "payments": payments,
            "total": int(count_row["count"]) if count_row else 0,
            "page": page,
            "limit": limit,
        }
    }


@router.post("/payments", status_code=status.HTTP_201_CREATED)
async def record_payment(
    body: PaymentCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "recordPayments")

    fields: dict[str, str] = {}
    if not body.student_id:
        fields["student_id"] = "Student is required."
    if not body.fee_structure_id:
        fields["fee_structure_id"] = "Fee structure is required."
    if body.amount is None or not isinstance(body.amount, int) or body.amount <= 0:
        fields["amount"] = "Amount must be a positive whole number."
    if body.payment_method not in PAYMENT_METHODS:
        fields["payment_method"] = "Invalid payment method."
    if fields:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Please fix the highlighted fields.",
            "VALIDATION_ERROR",
            fields,
        )

    payment_date = parse_payment_date(body.payment_date).isoformat()
    actor_id = fees_actor_id(user)
    student_uuid = parse_uuid(body.student_id, "student_id")
    structure_uuid = parse_uuid(body.fee_structure_id, "fee_structure_id")

    try:
        async with conn.transaction():
            result = await _record_fee_payment(
                conn,
                school_id=school_id,
                actor_id=actor_id,
                student_id=student_uuid,
                fee_structure_id=structure_uuid,
                amount=body.amount,
                payment_method=body.payment_method,
                payment_reference=body.payment_reference,
                payment_date=payment_date,
                notes=body.notes,
            )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to record fee payment")
        raise _error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Something went wrong. Please try again.",
            "SERVER_ERROR",
        ) from None

    return {"data": result}


@router.post("/payments/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_record_payments(
    body: BulkPaymentCreate,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "recordPayments")

    if not body.payments:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Select at least one student to record a payment.",
            "VALIDATION_ERROR",
        )
    if len(body.payments) > 50:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "You can record up to 50 payments at once.",
            "VALIDATION_ERROR",
        )
    if body.payment_method not in PAYMENT_METHODS:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Invalid payment method.",
            "VALIDATION_ERROR",
            {"payment_method": "Invalid payment method."},
        )

    payment_date = parse_payment_date(body.payment_date).isoformat()
    actor_id = fees_actor_id(user)
    recorded: list[dict] = []
    failed: list[dict] = []

    for index, line in enumerate(body.payments):
        if line.amount <= 0:
            failed.append(
                {
                    "index": index,
                    "student_id": line.student_id,
                    "error": "Amount must be a positive whole number.",
                }
            )
            continue
        if not line.fee_structure_id or not str(line.fee_structure_id).strip():
            failed.append(
                {
                    "index": index,
                    "student_id": line.student_id,
                    "error": "Fee structure is required for this student.",
                }
            )
            continue
        try:
            student_uuid = parse_uuid(line.student_id, "student_id")
            structure_uuid = parse_uuid(line.fee_structure_id, "fee_structure_id")
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
            failed.append(
                {
                    "index": index,
                    "student_id": line.student_id,
                    "error": detail.get("error", "Invalid student or fee structure."),
                }
            )
            continue
        try:
            async with conn.transaction():
                result = await _record_fee_payment(
                    conn,
                    school_id=school_id,
                    actor_id=actor_id,
                    student_id=student_uuid,
                    fee_structure_id=structure_uuid,
                    amount=line.amount,
                    payment_method=body.payment_method,
                    payment_reference=body.payment_reference,
                    payment_date=payment_date,
                    notes=body.notes,
                )
            recorded.append(result)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
            failed.append(
                {
                    "index": index,
                    "student_id": line.student_id,
                    "error": detail.get("error", "Payment failed."),
                }
            )
        except Exception:
            logger.exception("Bulk fee payment failed for student %s", line.student_id)
            failed.append(
                {
                    "index": index,
                    "student_id": line.student_id,
                    "error": "Something went wrong. Please try again.",
                }
            )

    if not recorded:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No payments were recorded. Check amounts and try again.",
            "BULK_PAYMENT_FAILED",
            failed=failed,
        )

    return {
        "data": {
            "recorded": recorded,
            "failed": failed,
            "summary": {
                "recorded_count": len(recorded),
                "failed_count": len(failed),
                "total_amount": sum(item["payment"]["amount"] for item in recorded),
            },
        }
    }


@router.post("/payments/{payment_id}/void")
async def void_payment(
    payment_id: uuid.UUID,
    body: VoidPaymentBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "voidPayments")

    if not body.reason or not body.reason.strip():
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required to void a payment.",
            "VALIDATION_ERROR",
            {"reason": "A reason is required."},
        )

    payment = await conn.fetchrow(
        "SELECT id, voided, fee_account_id FROM fee_payments WHERE id = $1 AND school_id = $2 LIMIT 1",
        payment_id,
        school_id,
    )
    if not payment:
        raise _error(status.HTTP_404_NOT_FOUND, "Payment not found.", "NOT_FOUND")
    if payment["voided"]:
        raise _error(status.HTTP_409_CONFLICT, "This payment has already been voided.", "ALREADY_VOIDED")

    try:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE fee_payments
                SET voided = true, voided_at = NOW(), voided_by = $1, void_reason = $2
                WHERE id = $3
                """,
                uuid.UUID(str(user["sub"])),
                body.reason.strip(),
                payment_id,
            )
            await _recalculate_fee_account(conn, payment["fee_account_id"])
            updated_payment = await conn.fetchrow("SELECT * FROM fee_payments WHERE id = $1", payment_id)
            updated_account = await conn.fetchrow(
                "SELECT * FROM student_fee_accounts WHERE id = $1",
                payment["fee_account_id"],
            )
    except Exception:
        raise _error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Something went wrong. Please try again.",
            "SERVER_ERROR",
        ) from None

    return {"data": {"payment": dict(updated_payment), "account": dict(updated_account)}}


@router.get("/accounts/student/{student_id}")
async def student_accounts(
    student_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")

    student = await conn.fetchrow(
        "SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
        student_id,
        school_id,
    )
    if not student:
        raise _error(status.HTTP_404_NOT_FOUND, "Student not found.", "NOT_FOUND")

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


@router.patch("/accounts/{account_id}/waive")
async def waive_account(
    account_id: uuid.UUID,
    body: WaiveAccountBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "waiveFees")

    if not body.reason or not body.reason.strip():
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required to waive fees.",
            "VALIDATION_ERROR",
            {"reason": "A reason is required."},
        )

    account = await conn.fetchrow(
        "SELECT * FROM student_fee_accounts WHERE id = $1 AND school_id = $2 LIMIT 1",
        account_id,
        school_id,
    )
    if not account:
        raise _error(status.HTTP_404_NOT_FOUND, "Fee account not found.", "NOT_FOUND")
    if account["waived_by"]:
        raise _error(status.HTTP_409_CONFLICT, "This fee account has already been waived.", "ALREADY_WAIVED")

    updated = await conn.fetchrow(
        """
        UPDATE student_fee_accounts
        SET status = 'waived', waived_by = $1, waived_reason = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
        """,
        uuid.UUID(str(user["sub"])),
        body.reason.strip(),
        account_id,
    )
    return {"data": dict(updated)}


@router.get("/outstanding")
async def outstanding_fees(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    class_id: str | None = Query(None),
    term_name: str | None = Query(None),
    academic_year: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewReports")

    offset = (page - 1) * limit
    conditions = [
        "sfa.school_id = $1",
        "sfa.status IN ('unpaid', 'partial')",
        "sfa.waived_by IS NULL",
    ]
    params: list[Any] = [school_id]
    idx = 2

    if class_id:
        conditions.append(f"s.current_class_id = ${idx}")
        params.append(uuid.UUID(class_id))
        idx += 1
    if term_name:
        conditions.append(f"fs.term_name = ${idx}")
        params.append(term_name)
        idx += 1
    if academic_year is not None:
        conditions.append(f"fs.academic_year = ${idx}")
        params.append(academic_year)
        idx += 1
    if status_filter in ("unpaid", "partial"):
        conditions.append(f"sfa.status = ${idx}")
        params.append(status_filter)
        idx += 1
    if search and search.strip():
        conditions.append(f"(s.full_name ILIKE ${idx} OR s.learner_id ILIKE ${idx})")
        params.append(f"%{search.strip()}%")
        idx += 1

    where = " AND ".join(conditions)
    summary = await conn.fetchrow(
        f"""
        SELECT
          COUNT(*)::int AS total_students,
          COALESCE(SUM(sfa.balance), 0)::bigint AS total_outstanding,
          COUNT(*) FILTER (WHERE sfa.status = 'unpaid')::int AS unpaid_count,
          COUNT(*) FILTER (WHERE sfa.status = 'partial')::int AS partial_count
        FROM student_fee_accounts sfa
        JOIN students s ON s.id = sfa.student_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE {where}
        """,
        *params,
    )

    list_params = [*params, limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
          s.id AS student_id,
          s.full_name,
          s.learner_id,
          sc.level,
          sc.stream,
          sg.full_name AS guardian_name,
          sg.phone AS guardian_phone,
          sfa.id AS account_id,
          sfa.fee_structure_id,
          sfa.amount_owed,
          sfa.amount_paid,
          sfa.balance,
          sfa.status,
          fs.term_name,
          fs.academic_year
        FROM student_fee_accounts sfa
        JOIN students s ON s.id = sfa.student_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
        WHERE {where}
        ORDER BY sfa.balance DESC, s.full_name ASC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *list_params,
    )

    students = []
    for row in rows:
        item = dict(row)
        item["class_name"] = format_class_name(item.get("level") or "", item.get("stream"))
        item["fee_structure_id"] = str(item["fee_structure_id"])
        item["amount_owed"] = int(item["amount_owed"])
        item["amount_paid"] = int(item["amount_paid"])
        item["balance"] = int(item["balance"])
        students.append(item)

    total_students = int(summary["total_students"]) if summary else 0
    return {
        "data": {
            "students": students,
            "summary": {
                "total_students": total_students,
                "total_outstanding": int(summary["total_outstanding"]) if summary else 0,
                "unpaid_count": int(summary["unpaid_count"]) if summary else 0,
                "partial_count": int(summary["partial_count"]) if summary else 0,
            },
            "page": page,
            "total": total_students,
        }
    }


@router.get("/receipts/{payment_id}")
@limiter.limit("20/minute", key_func=get_school_key)
async def fee_receipt_pdf(
    request: Request,
    payment_id: uuid.UUID,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")

    try:
        pdf_bytes, receipt_number = await generate_fee_receipt_pdf(conn, payment_id, school_id)
    except ReceiptNotFoundError:
        raise _error(status.HTTP_404_NOT_FOUND, "Payment not found.", "NOT_FOUND") from None
    except Exception:
        raise _error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Failed to generate receipt PDF.",
            "SERVER_ERROR",
        ) from None

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="receipt-{receipt_number}.pdf"'
        },
    )


@router.get("/dashboard-stats")
async def dashboard_stats(
    term_name: str | None = Query(None),
    academic_year: int | None = Query(None),
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "viewFees")

    conditions = ["sfa.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2
    if term_name:
        conditions.append(f"fs.term_name = ${idx}")
        params.append(term_name)
        idx += 1
    if academic_year is not None:
        conditions.append(f"fs.academic_year = ${idx}")
        params.append(academic_year)
        idx += 1
    where = " AND ".join(conditions)

    stats = await conn.fetchrow(
        f"""
        SELECT
          COALESCE(SUM(sfa.amount_paid), 0)::bigint AS total_collected,
          COALESCE(SUM(CASE WHEN sfa.status IN ('unpaid', 'partial') THEN sfa.balance ELSE 0 END), 0)::bigint AS total_outstanding,
          COUNT(*) FILTER (WHERE sfa.status = 'paid')::int AS students_fully_paid,
          COUNT(*) FILTER (WHERE sfa.status IN ('unpaid', 'partial'))::int AS students_with_balance
        FROM student_fee_accounts sfa
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE {where}
        """,
        *params,
    )

    recent_params: list[Any] = [school_id]
    recent_filters = ""
    if term_name:
        recent_filters += " AND fs.term_name = $2"
        recent_params.append(term_name)
    if academic_year is not None:
        recent_filters += f" AND fs.academic_year = ${len(recent_params) + 1}"
        recent_params.append(academic_year)

    recent = await conn.fetch(
        f"""
        SELECT
          fp.id,
          fp.receipt_number,
          fp.amount,
          fp.payment_method,
          fp.payment_date,
          fp.voided,
          s.full_name AS student_name
        FROM fee_payments fp
        JOIN students s ON s.id = fp.student_id
        JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE fp.school_id = $1 AND fp.voided = false
        {recent_filters}
        ORDER BY fp.created_at DESC
        LIMIT 10
        """,
        *recent_params,
    )

    return {
        "data": {
            "stats": {
                "total_collected": int(stats["total_collected"]) if stats else 0,
                "total_outstanding": int(stats["total_outstanding"]) if stats else 0,
                "students_fully_paid": int(stats["students_fully_paid"]) if stats else 0,
                "students_with_balance": int(stats["students_with_balance"]) if stats else 0,
            },
            "recent_payments": [
                {**dict(row), "amount": int(row["amount"])} for row in recent
            ],
        }
    }


@router.post("/reminders/sms")
@limiter.limit("10/minute", key_func=get_school_key)
async def sms_reminders(
    request: Request,
    body: SmsReminderBody,
    ctx: tuple[uuid.UUID, dict] = Depends(get_tenant_and_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_permission(user, "manageFees")

    conditions = [
        "sfa.school_id = $1",
        "sfa.status IN ('unpaid', 'partial')",
        "sfa.waived_by IS NULL",
        "sg.phone IS NOT NULL",
        "sg.is_primary = true",
    ]
    params: list[Any] = [school_id]
    idx = 2

    if body.class_id:
        conditions.append(f"s.current_class_id = ${idx}")
        params.append(uuid.UUID(body.class_id))
        idx += 1
    if body.term_name:
        conditions.append(f"fs.term_name = ${idx}")
        params.append(body.term_name)
        idx += 1
    if body.academic_year is not None:
        conditions.append(f"fs.academic_year = ${idx}")
        params.append(body.academic_year)

    rows = await conn.fetch(
        f"""
        SELECT
          s.full_name AS student_name,
          sc.level,
          sc.stream,
          sg.phone AS guardian_phone,
          sfa.balance,
          fs.term_name,
          sch.name AS school_name
        FROM student_fee_accounts sfa
        JOIN students s ON s.id = sfa.student_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        JOIN schools sch ON sch.id = sfa.school_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
        WHERE {" AND ".join(conditions)}
        """,
        *params,
    )

    recipients = []
    for row in rows:
        class_name = format_class_name(row["level"] or "", row["stream"])
        balance = int(row["balance"])
        recipients.append(
            {
                "student_name": row["student_name"],
                "guardian_phone": row["guardian_phone"],
                "class_name": class_name,
                "balance": balance,
                "term_name": row["term_name"],
                "preview": (
                    f"Dear Parent of {row['student_name']} ({class_name}), school fees for "
                    f"{row['term_name']} are outstanding. Amount due: {format_ugx(balance)}. "
                    f"Please pay at the school office. Thank you — {row['school_name']}."
                ),
            }
        )

    return {
        "data": {
            "queued": len(recipients),
            "sent": 0,
            "failed": 0,
            "message": "MakyReach SMS is not configured yet. Recipients were prepared but not sent.",
            "recipients": recipients,
        }
    }


from app.routers.fees_extension import router as fees_extension_router

router.include_router(fees_extension_router)
