from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.permissions import can
from app.lib.receipt import compute_fee_account_status, format_class_name, format_ugx, generate_receipt_number

logger = logging.getLogger("makyschool")

PAYMENT_METHODS = frozenset({"cash", "bank_transfer", "mobile_money", "cheque", "other"})


def parse_uuid(value: str, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value).strip())
    except (TypeError, ValueError, AttributeError) as exc:
        raise fees_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid {field_name.replace('_', ' ')}.",
            "VALIDATION_ERROR",
            {field_name: f"Invalid {field_name.replace('_', ' ')}."},
        ) from exc


def parse_payment_date(value: str | None) -> date:
    if not value:
        return date.today()
    try:
        return date.fromisoformat(value[:10])
    except ValueError as exc:
        raise fees_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Invalid payment date.",
            "VALIDATION_ERROR",
            {"payment_date": "Use a valid date (YYYY-MM-DD)."},
        ) from exc


def fees_error(
    status_code: int,
    error: str,
    code: str,
    fields: dict[str, str] | None = None,
    **extra: Any,
) -> HTTPException:
    detail: dict[str, Any] = {"error": error, "code": code}
    if fields:
        detail["fields"] = fields
    detail.update(extra)
    return HTTPException(status_code=status_code, detail=detail)


def require_fees_permission(user: dict, action: str) -> None:
    if not can(user.get("role", ""), action):
        raise fees_error(
            status.HTTP_403_FORBIDDEN,
            "You do not have permission to perform this action.",
            "FORBIDDEN",
        )


def fees_actor_id(user: dict) -> uuid.UUID:
    """Resolve the school users.id for the authenticated actor."""
    actor = user.get("user_db_id") or user.get("sub")
    if not actor:
        raise fees_error(
            status.HTTP_401_UNAUTHORIZED,
            "Authenticated user context is missing.",
            "UNAUTHORIZED",
        )
    return uuid.UUID(str(actor))


async def recalculate_fee_account(conn: asyncpg.Connection, account_id: uuid.UUID) -> None:
    account = await conn.fetchrow(
        "SELECT amount_owed, waived_by FROM student_fee_accounts WHERE id = $1 LIMIT 1",
        account_id,
    )
    if not account:
        return

    paid_row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(amount), 0)::bigint AS total
        FROM fee_payments
        WHERE fee_account_id = $1 AND voided = false
        """,
        account_id,
    )
    amount_paid = int(paid_row["total"]) if paid_row else 0
    amount_owed = int(account["amount_owed"])
    account_status = compute_fee_account_status(
        amount_owed, amount_paid, bool(account["waived_by"])
    )
    await conn.execute(
        """
        UPDATE student_fee_accounts
        SET amount_paid = $1, status = $2, updated_at = NOW()
        WHERE id = $3
        """,
        amount_paid,
        account_status,
        account_id,
    )


async def record_fee_payment(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    student_id: uuid.UUID,
    fee_structure_id: uuid.UUID,
    amount: int,
    payment_method: str,
    payment_reference: str | None,
    payment_date: str,
    notes: str | None,
) -> dict[str, Any]:
    """Record one fee payment. Caller should wrap in a transaction when needed."""
    if payment_method not in PAYMENT_METHODS:
        raise fees_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Invalid payment method.",
            "VALIDATION_ERROR",
            {"payment_method": "Invalid payment method."},
        )

    student = await conn.fetchrow(
        "SELECT full_name, learner_id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
        student_id,
        school_id,
    )
    if not student:
        raise fees_error(status.HTTP_404_NOT_FOUND, "Student not found in your school.", "NOT_FOUND")

    structure = await conn.fetchrow(
        """
        SELECT fs.term_name, sc.level, sc.stream
        FROM fee_structures fs
        JOIN school_classes sc ON sc.id = fs.class_id
        WHERE fs.id = $1 AND fs.school_id = $2
        LIMIT 1
        """,
        fee_structure_id,
        school_id,
    )
    if not structure:
        raise fees_error(status.HTTP_404_NOT_FOUND, "Fee structure not found.", "NOT_FOUND")

    account = await conn.fetchrow(
        """
        SELECT id, amount_owed, amount_paid, balance, status, waived_by
        FROM student_fee_accounts
        WHERE student_id = $1 AND fee_structure_id = $2 AND school_id = $3
        LIMIT 1
        """,
        student_id,
        fee_structure_id,
        school_id,
    )
    if not account:
        raise fees_error(
            status.HTTP_404_NOT_FOUND,
            "This student has not been assigned this fee structure. Assign the fee structure to their class first.",
            "NOT_FOUND",
        )

    if account["waived_by"]:
        raise fees_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "This fee account has been waived.", "ALREADY_WAIVED")

    balance = int(account["balance"])
    if amount <= 0:
        raise fees_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Amount must be a positive whole number.",
            "VALIDATION_ERROR",
            {"amount": "Amount must be a positive whole number."},
        )
    if amount > balance:
        raise fees_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Payment of {format_ugx(amount)} exceeds the outstanding balance of {format_ugx(balance)}.",
            "OVERPAYMENT",
        )

    receipt_number = await generate_receipt_number(school_id, conn)
    payment_row = await conn.fetchrow(
        """
        INSERT INTO fee_payments (
          school_id, student_id, fee_account_id, receipt_number, amount,
          payment_method, payment_reference, payment_date, notes, recorded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        """,
        school_id,
        student_id,
        account["id"],
        receipt_number,
        amount,
        payment_method,
        payment_reference.strip() if payment_reference else None,
        parse_payment_date(payment_date),
        notes.strip() if notes else None,
        actor_id,
    )

    await recalculate_fee_account(conn, account["id"])
    updated_account = await conn.fetchrow(
        "SELECT amount_owed, amount_paid, balance, status FROM student_fee_accounts WHERE id = $1",
        account["id"],
    )

    class_name = format_class_name(structure["level"], structure["stream"])
    return {
        "payment": {
            "id": str(payment_row["id"]),
            "receipt_number": receipt_number,
            "amount": amount,
            "student_name": student["full_name"],
            "learner_id": student["learner_id"],
            "class_name": class_name,
            "term_name": structure["term_name"],
            "payment_method": payment_method,
            "payment_date": parse_payment_date(payment_date).isoformat(),
        },
        "account": {
            "amount_owed": int(updated_account["amount_owed"]),
            "amount_paid": int(updated_account["amount_paid"]),
            "balance": int(updated_account["balance"]),
            "status": updated_account["status"],
        },
    }
