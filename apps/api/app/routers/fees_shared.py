from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from app.lib.permissions import can
from app.lib.receipt import compute_fee_account_status

PAYMENT_METHODS = frozenset({"cash", "bank_transfer", "mobile_money", "cheque", "other"})


def fees_error(
    status_code: int,
    error: str,
    code: str,
    fields: dict[str, str] | None = None,
) -> HTTPException:
    detail: dict[str, Any] = {"error": error, "code": code}
    if fields:
        detail["fields"] = fields
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
