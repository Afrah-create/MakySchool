from __future__ import annotations

import uuid
from typing import Any

import asyncpg


async def load_invoice_item_balances(
    conn: asyncpg.Connection, school_id: uuid.UUID, invoice_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Return invoice line items with amount_paid and balance from allocations."""
    rows = await conn.fetch(
        """
        SELECT
          ii.id,
          ii.description,
          ii.quantity,
          ii.unit_amount,
          ii.total_amount,
          ii.account_id,
          a.name AS account_name,
          a.code AS account_code,
          COALESCE((
            SELECT SUM(fpa.amount)::bigint
            FROM fee_payment_allocations fpa
            JOIN fee_payments fp ON fp.id = fpa.payment_id
            WHERE fpa.invoice_item_id = ii.id
              AND fpa.school_id = ii.school_id
              AND fp.voided = false
          ), 0)::bigint AS amount_paid
        FROM invoice_items ii
        LEFT JOIN accounts a ON a.id = ii.account_id
        WHERE ii.invoice_id = $1 AND ii.school_id = $2
        ORDER BY ii.created_at ASC
        """,
        invoice_id,
        school_id,
    )
    items: list[dict[str, Any]] = []
    for row in rows:
        total = int(row["total_amount"])
        paid = int(row["amount_paid"] or 0)
        items.append(
            {
                "id": str(row["id"]),
                "description": row["description"],
                "quantity": int(row["quantity"]),
                "unit_amount": int(row["unit_amount"]),
                "total_amount": total,
                "amount_paid": paid,
                "balance": max(total - paid, 0),
                "account_id": str(row["account_id"]) if row["account_id"] else None,
                "account_name": row["account_name"],
                "account_code": row["account_code"],
            }
        )
    return items


def build_fifo_allocations(
    amount: int, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Allocate `amount` across items with outstanding balance, in order."""
    remaining = amount
    allocations: list[dict[str, Any]] = []
    for item in items:
        if remaining <= 0:
            break
        balance = int(item.get("balance") or 0)
        if balance <= 0:
            continue
        apply = min(remaining, balance)
        allocations.append(
            {
                "invoice_item_id": item["id"],
                "amount": apply,
                "description": item.get("description"),
            }
        )
        remaining -= apply
    return allocations


async def insert_payment_allocations(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    payment_id: uuid.UUID,
    invoice_id: uuid.UUID,
    allocations: list[dict[str, Any]],
) -> None:
    if not allocations:
        return

    payment_ids = [payment_id] * len(allocations)
    school_ids = [school_id] * len(allocations)
    invoice_ids = [invoice_id] * len(allocations)
    item_ids = [uuid.UUID(str(a["invoice_item_id"])) for a in allocations]
    amounts = [int(a["amount"]) for a in allocations]

    await conn.execute(
        """
        INSERT INTO fee_payment_allocations
          (school_id, payment_id, invoice_id, invoice_item_id, amount)
        SELECT school_id, payment_id, invoice_id, invoice_item_id, amount
        FROM unnest(
          $1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::bigint[]
        ) AS t(school_id, payment_id, invoice_id, invoice_item_id, amount)
        """,
        school_ids,
        payment_ids,
        invoice_ids,
        item_ids,
        amounts,
    )


async def validate_and_normalize_allocations(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    invoice_id: uuid.UUID,
    payment_amount: int,
    allocations: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Validate explicit allocations or build FIFO ones. Raises ValueError on bad input."""
    items = await load_invoice_item_balances(conn, school_id, invoice_id)
    if not items:
        return []

    if not allocations:
        built = build_fifo_allocations(payment_amount, items)
        allocated = sum(a["amount"] for a in built)
        if allocated != payment_amount:
            raise ValueError(
                "Could not allocate the full payment across invoice line items. "
                "Check outstanding item balances."
            )
        return built

    balances = {item["id"]: item for item in items}
    normalized: list[dict[str, Any]] = []
    total = 0
    seen: set[str] = set()

    for raw in allocations:
        item_id = str(raw.get("invoice_item_id") or "").strip()
        amount = int(raw.get("amount") or 0)
        if not item_id or item_id in seen:
            raise ValueError("Each invoice item can appear only once in allocations.")
        if amount <= 0:
            raise ValueError("Allocation amounts must be positive whole numbers.")
        item = balances.get(item_id)
        if not item:
            raise ValueError("One or more allocation items do not belong to this invoice.")
        if amount > int(item["balance"]):
            raise ValueError(
                f"Allocation for “{item['description']}” exceeds its outstanding "
                f"balance."
            )
        seen.add(item_id)
        total += amount
        normalized.append(
            {
                "invoice_item_id": item_id,
                "amount": amount,
                "description": item["description"],
            }
        )

    if total != payment_amount:
        raise ValueError(
            f"Allocation total ({total}) must equal the payment amount ({payment_amount})."
        )
    return normalized


async def find_open_invoice_for_structure(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    fee_structure_id: uuid.UUID,
) -> uuid.UUID | None:
    row = await conn.fetchrow(
        """
        SELECT id
        FROM invoices
        WHERE school_id = $1
          AND student_id = $2
          AND fee_structure_id = $3
          AND status NOT IN ('cancelled', 'voided')
          AND balance > 0
        ORDER BY invoice_date ASC, created_at ASC
        LIMIT 1
        """,
        school_id,
        student_id,
        fee_structure_id,
    )
    return row["id"] if row else None


async def load_payment_allocations(
    conn: asyncpg.Connection, school_id: uuid.UUID, payment_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          fpa.id,
          fpa.amount,
          fpa.invoice_item_id,
          fpa.invoice_id,
          ii.description,
          ii.total_amount AS item_total,
          COALESCE((
            SELECT SUM(x.amount)::bigint
            FROM fee_payment_allocations x
            JOIN fee_payments p ON p.id = x.payment_id
            WHERE x.invoice_item_id = fpa.invoice_item_id
              AND p.voided = false
              AND p.created_at <= fp.created_at
          ), 0)::bigint AS paid_on_item_through_this,
          COALESCE((
            SELECT SUM(x.amount)::bigint
            FROM fee_payment_allocations x
            JOIN fee_payments p ON p.id = x.payment_id
            WHERE x.invoice_item_id = fpa.invoice_item_id
              AND p.voided = false
          ), 0)::bigint AS item_amount_paid
        FROM fee_payment_allocations fpa
        JOIN fee_payments fp ON fp.id = fpa.payment_id
        JOIN invoice_items ii ON ii.id = fpa.invoice_item_id
        WHERE fpa.payment_id = $1 AND fpa.school_id = $2
        ORDER BY ii.created_at ASC
        """,
        payment_id,
        school_id,
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        item_total = int(row["item_total"])
        item_paid = int(row["item_amount_paid"] or 0)
        paid_this = int(row["amount"])
        paid_through = int(row["paid_on_item_through_this"] or 0)
        previous = max(paid_through - paid_this, 0)
        result.append(
            {
                "id": str(row["id"]),
                "invoice_item_id": str(row["invoice_item_id"]),
                "invoice_id": str(row["invoice_id"]),
                "description": row["description"],
                "amount": paid_this,
                "item_total": item_total,
                "previous_paid": previous,
                "amount_paid": item_paid,
                "balance": max(item_total - item_paid, 0),
            }
        )
    return result
