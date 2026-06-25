from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.services.fees._common import row_dict, rows_list


async def list_budget_items(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    term_name: str | None,
    academic_year: int | None,
    budget_type: str | None,
) -> list[dict[str, Any]]:
    conditions = ["bi.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2
    if term_name:
        conditions.append(f"bi.term_name = ${idx}")
        params.append(term_name)
        idx += 1
    if academic_year is not None:
        conditions.append(f"bi.academic_year = ${idx}")
        params.append(academic_year)
        idx += 1
    if budget_type:
        conditions.append(f"bi.budget_type = ${idx}")
        params.append(budget_type)
        idx += 1

    where = " AND ".join(conditions)
    rows = await conn.fetch(
        f"""
        SELECT bi.*, a.code AS account_code, a.name AS account_name
        FROM budget_items bi
        LEFT JOIN accounts a ON a.id = bi.account_id
        WHERE {where}
        ORDER BY bi.budget_type ASC, bi.name ASC
        """,
        *params,
    )
    items = []
    for row in rows:
        item = dict(row)
        item["budgeted_amount"] = int(item["budgeted_amount"])
        items.append(item)
    return items


async def create_budget_item(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    body: dict[str, Any],
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO budget_items (
          id, school_id, account_id, term_name, academic_year, name, category,
          budget_type, budgeted_amount, notes, created_by
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        """,
        school_id,
        uuid.UUID(body["account_id"]) if body.get("account_id") else None,
        body["term_name"],
        int(body["academic_year"]),
        body["name"].strip(),
        body.get("category"),
        body["budget_type"],
        int(body["budgeted_amount"]),
        body.get("notes"),
        user_id,
    )
    data = row_dict(row)
    data["budgeted_amount"] = int(data["budgeted_amount"])
    return data


async def update_budget_item(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    item_id: uuid.UUID,
    body: dict[str, Any],
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE budget_items
        SET account_id = COALESCE($3, account_id),
            name = COALESCE($4, name),
            category = COALESCE($5, category),
            budgeted_amount = COALESCE($6, budgeted_amount),
            notes = COALESCE($7, notes),
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING *
        """,
        item_id,
        school_id,
        uuid.UUID(body["account_id"]) if body.get("account_id") else None,
        body.get("name"),
        body.get("category"),
        int(body["budgeted_amount"]) if body.get("budgeted_amount") is not None else None,
        body.get("notes"),
    )
    if not row:
        return None
    data = row_dict(row)
    data["budgeted_amount"] = int(data["budgeted_amount"])
    return data


async def delete_budget_item(conn: asyncpg.Connection, school_id: uuid.UUID, item_id: uuid.UUID) -> bool:
    result = await conn.execute(
        "DELETE FROM budget_items WHERE id = $1 AND school_id = $2",
        item_id,
        school_id,
    )
    return result.endswith("1")


def _variance_status(budget_type: str, budgeted: int, actual: int | None) -> str:
    if actual is None:
        return "coming_soon"
    if budgeted <= 0:
        return "on_track"
    variance_pct = abs(budgeted - actual) / budgeted * 100
    if variance_pct <= 10:
        return "on_track"
    if budget_type == "income":
        return "under" if actual < budgeted else "on_track"
    return "over" if actual > budgeted else "under"


async def budget_report(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    term_name: str,
    academic_year: int,
) -> dict[str, Any]:
    items = await list_budget_items(
        conn, school_id, term_name=term_name, academic_year=academic_year, budget_type=None
    )

    report_items = []
    total_budgeted_income = 0
    total_actual_income = 0
    total_budgeted_expense = 0

    for item in items:
        budgeted = int(item["budgeted_amount"])
        budget_type = item["budget_type"]
        account_id = item.get("account_id")

        if budget_type == "expense":
            actual = None
            variance = None
            variance_percent = None
            status = "coming_soon"
            total_budgeted_expense += budgeted
        else:
            fee_actual = await conn.fetchval(
                """
                SELECT COALESCE(SUM(fp.amount), 0)::bigint
                FROM fee_payments fp
                JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
                JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
                WHERE fp.school_id = $1 AND fp.voided = false
                  AND fs.term_name = $2 AND fs.academic_year = $3
                """,
                school_id,
                term_name,
                academic_year,
            )
            other_actual = 0
            if account_id:
                other_actual = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(oii.amount), 0)::bigint
                    FROM other_income oi
                    JOIN other_income_items oii ON oii.other_income_id = oi.id
                    WHERE oi.school_id = $1 AND oi.voided = false
                      AND oii.account_id = $2
                    """,
                    school_id,
                    uuid.UUID(str(account_id)),
                ) or 0

            actual = int(fee_actual or 0) + int(other_actual)
            if account_id:
                actual = int(other_actual)
            else:
                actual = int(fee_actual or 0)

            variance = budgeted - actual
            variance_percent = round((variance / budgeted * 100), 1) if budgeted else 0.0
            status = _variance_status("income", budgeted, actual)
            total_budgeted_income += budgeted
            total_actual_income += actual

        report_items.append(
            {
                "id": str(item["id"]),
                "name": item["name"],
                "category": item.get("category"),
                "budget_type": budget_type,
                "account_id": str(account_id) if account_id else None,
                "account_code": item.get("account_code"),
                "budgeted_amount": budgeted,
                "actual_amount": actual,
                "variance": variance if budget_type == "income" else None,
                "variance_percent": variance_percent if budget_type == "income" else None,
                "status": status,
            }
        )

    return {
        "term_name": term_name,
        "academic_year": academic_year,
        "summary": {
            "total_budgeted_income": total_budgeted_income,
            "total_actual_income": total_actual_income,
            "total_budgeted_expense": total_budgeted_expense,
            "total_actual_expense": None,
        },
        "items": report_items,
    }
