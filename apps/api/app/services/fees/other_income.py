from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import asyncpg

from app.lib.sequences import generate_income_reference
from app.services.fees._common import row_dict, rows_list

PAYMENT_METHODS = frozenset({"cash", "bank_transfer", "mobile_money", "cheque", "other"})


def _parse_date(value: str | date | None) -> date:
    if value is None:
        return date.today()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


async def list_other_income(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    page: int,
    limit: int,
    date_from: str | None,
    date_to: str | None,
    source_id: uuid.UUID | None,
    payment_method: str | None,
    search: str | None,
) -> dict[str, Any]:
    conditions = ["oi.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2

    if date_from:
        conditions.append(f"oi.income_date >= ${idx}")
        params.append(_parse_date(date_from))
        idx += 1
    if date_to:
        conditions.append(f"oi.income_date <= ${idx}")
        params.append(_parse_date(date_to))
        idx += 1
    if source_id:
        conditions.append(f"oi.source_id = ${idx}")
        params.append(source_id)
        idx += 1
    if payment_method:
        conditions.append(f"oi.payment_method = ${idx}")
        params.append(payment_method)
        idx += 1
    if search and search.strip():
        conditions.append(f"(oi.reference_number ILIKE ${idx} OR oi.description ILIKE ${idx})")
        params.append(f"%{search.strip()}%")
        idx += 1

    where = " AND ".join(conditions)
    offset = (page - 1) * limit
    count = await conn.fetchval(f"SELECT COUNT(*)::int FROM other_income oi WHERE {where}", *params)

    rows = await conn.fetch(
        f"""
        SELECT
          oi.id, oi.reference_number, oi.description, oi.income_date, oi.total_amount,
          oi.payment_method, oi.voided,
          src.name AS source_name,
          COALESCE(u.name, u.full_name) AS recorded_by_name,
          (SELECT COUNT(*)::int FROM other_income_items oii WHERE oii.other_income_id = oi.id) AS item_count
        FROM other_income oi
        LEFT JOIN income_sources src ON src.id = oi.source_id
        LEFT JOIN users u ON u.id = oi.recorded_by
        WHERE {where}
        ORDER BY oi.income_date DESC, oi.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    items = []
    for row in rows:
        item = dict(row)
        item["total_amount"] = int(item["total_amount"])
        item["item_count"] = int(item["item_count"])
        items.append(item)

    return {"items": items, "total": int(count or 0), "page": page, "limit": limit}


async def get_other_income(
    conn: asyncpg.Connection, school_id: uuid.UUID, income_id: uuid.UUID
) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT oi.*, src.name AS source_name, COALESCE(u.name, u.full_name) AS recorded_by_name
        FROM other_income oi
        LEFT JOIN income_sources src ON src.id = oi.source_id
        LEFT JOIN users u ON u.id = oi.recorded_by
        WHERE oi.id = $1 AND oi.school_id = $2 LIMIT 1
        """,
        income_id,
        school_id,
    )
    if not row:
        return None

    items = await conn.fetch(
        """
        SELECT oii.id, oii.description, oii.amount, oii.account_id, a.name AS account_name, a.code AS account_code
        FROM other_income_items oii
        LEFT JOIN accounts a ON a.id = oii.account_id
        WHERE oii.other_income_id = $1 AND oii.school_id = $2
        ORDER BY oii.created_at ASC
        """,
        income_id,
        school_id,
    )
    data = dict(row)
    data["total_amount"] = int(data["total_amount"])
    data["items"] = [{**dict(i), "amount": int(i["amount"])} for i in items]
    return data


async def create_other_income(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None,
    account_id: uuid.UUID | None,
    description: str,
    income_date: str | date,
    payment_method: str,
    payment_reference: str | None,
    notes: str | None,
    items: list[dict[str, Any]],
) -> dict:
    if not items:
        raise ValueError("At least one income item is required.")
    total = sum(int(item["amount"]) for item in items)
    if total <= 0:
        raise ValueError("Total amount must be positive.")

    async with conn.transaction():
        reference = await generate_income_reference(conn, school_id)
        income_id = uuid.uuid4()
        row = await conn.fetchrow(
            """
            INSERT INTO other_income (
              id, school_id, source_id, account_id, reference_number, description,
              income_date, total_amount, payment_method, payment_reference, notes, recorded_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id, reference_number, total_amount
            """,
            income_id,
            school_id,
            source_id,
            account_id,
            reference,
            description.strip(),
            _parse_date(income_date),
            total,
            payment_method,
            payment_reference,
            notes,
            user_id,
        )
        for item in items:
            await conn.execute(
                """
                INSERT INTO other_income_items (id, school_id, other_income_id, account_id, description, amount)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
                """,
                school_id,
                income_id,
                uuid.UUID(item["account_id"]) if item.get("account_id") else None,
                item["description"].strip(),
                int(item["amount"]),
            )

    return {"id": str(row["id"]), "reference_number": row["reference_number"], "total_amount": int(row["total_amount"])}


async def update_other_income(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    income_id: uuid.UUID,
    *,
    source_id: uuid.UUID | None,
    account_id: uuid.UUID | None,
    description: str,
    income_date: str | date,
    payment_method: str,
    payment_reference: str | None,
    notes: str | None,
    items: list[dict[str, Any]],
) -> dict | None:
    existing = await conn.fetchrow(
        "SELECT id, voided FROM other_income WHERE id = $1 AND school_id = $2 LIMIT 1",
        income_id,
        school_id,
    )
    if not existing or existing["voided"]:
        return None
    if not items:
        raise ValueError("At least one income item is required.")
    total = sum(int(item["amount"]) for item in items)

    async with conn.transaction():
        await conn.execute(
            """
            UPDATE other_income
            SET source_id = $3, account_id = $4, description = $5, income_date = $6,
                total_amount = $7, payment_method = $8, payment_reference = $9, notes = $10, updated_at = NOW()
            WHERE id = $1 AND school_id = $2
            """,
            income_id,
            school_id,
            source_id,
            account_id,
            description.strip(),
            _parse_date(income_date),
            total,
            payment_method,
            payment_reference,
            notes,
        )
        await conn.execute(
            "DELETE FROM other_income_items WHERE other_income_id = $1 AND school_id = $2",
            income_id,
            school_id,
        )
        for item in items:
            await conn.execute(
                """
                INSERT INTO other_income_items (id, school_id, other_income_id, account_id, description, amount)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
                """,
                school_id,
                income_id,
                uuid.UUID(item["account_id"]) if item.get("account_id") else None,
                item["description"].strip(),
                int(item["amount"]),
            )

    return await get_other_income(conn, school_id, income_id)


async def void_other_income(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    income_id: uuid.UUID,
    user_id: uuid.UUID,
    reason: str,
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE other_income
        SET voided = true, voided_at = NOW(), voided_by = $3, void_reason = $4, updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND voided = false
        RETURNING reference_number
        """,
        income_id,
        school_id,
        user_id,
        reason.strip(),
    )
    return row_dict(row)
