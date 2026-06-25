from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import asyncpg

from app.lib.receipt import generate_receipt_number
from app.lib.sequences import generate_invoice_number
from app.services.fees._common import row_dict, rows_list

INVOICE_STATUSES = frozenset({"unpaid", "partial", "paid", "cancelled", "voided"})


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _invoice_status(total: int, paid: int, current: str) -> str:
    if current in ("cancelled", "voided"):
        return current
    if paid <= 0:
        return "unpaid"
    if paid >= total:
        return "paid"
    return "partial"


async def _load_invoice_items(conn: asyncpg.Connection, school_id: uuid.UUID, invoice_id: uuid.UUID) -> list:
    rows = await conn.fetch(
        """
        SELECT ii.id, ii.description, ii.quantity, ii.unit_amount, ii.total_amount, ii.account_id,
               a.name AS account_name, a.code AS account_code
        FROM invoice_items ii
        LEFT JOIN accounts a ON a.id = ii.account_id
        WHERE ii.invoice_id = $1 AND ii.school_id = $2
        ORDER BY ii.created_at ASC
        """,
        invoice_id,
        school_id,
    )
    return [
        {
            **dict(r),
            "quantity": int(r["quantity"]),
            "unit_amount": int(r["unit_amount"]),
            "total_amount": int(r["total_amount"]),
        }
        for r in rows
    ]


async def get_invoice(conn: asyncpg.Connection, school_id: uuid.UUID, invoice_id: uuid.UUID) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT
          inv.*,
          s.full_name AS student_name, s.learner_id,
          sc.level, sc.stream,
          sg.full_name AS guardian_name, sg.phone AS guardian_phone
        FROM invoices inv
        JOIN students s ON s.id = inv.student_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
        WHERE inv.id = $1 AND inv.school_id = $2 LIMIT 1
        """,
        invoice_id,
        school_id,
    )
    if not row:
        return None

    from app.lib.receipt import format_class_name

    data = dict(row)
    data["class_name"] = format_class_name(data.get("level") or "", data.get("stream"))
    data["total_amount"] = int(data["total_amount"])
    data["amount_paid"] = int(data["amount_paid"])
    data["balance"] = int(data["balance"])
    data["items"] = await _load_invoice_items(conn, school_id, invoice_id)

    payments = await conn.fetch(
        """
        SELECT fp.id, fp.receipt_number, fp.amount, fp.payment_method, fp.payment_date, fp.voided
        FROM fee_payments fp
        WHERE fp.invoice_id = $1 AND fp.school_id = $2
        ORDER BY fp.payment_date DESC, fp.created_at DESC
        """,
        invoice_id,
        school_id,
    )
    data["payments"] = [{**dict(p), "amount": int(p["amount"])} for p in payments]
    return data


async def list_invoices(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    page: int,
    limit: int,
    student_id: uuid.UUID | None,
    class_id: uuid.UUID | None,
    status: str | None,
    term_name: str | None,
    academic_year: int | None,
    search: str | None,
) -> dict[str, Any]:
    conditions = ["inv.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2

    if student_id:
        conditions.append(f"inv.student_id = ${idx}")
        params.append(student_id)
        idx += 1
    if class_id:
        conditions.append(f"s.current_class_id = ${idx}")
        params.append(class_id)
        idx += 1
    if status:
        conditions.append(f"inv.status = ${idx}")
        params.append(status)
        idx += 1
    if term_name:
        conditions.append(f"inv.term_name = ${idx}")
        params.append(term_name)
        idx += 1
    if academic_year is not None:
        conditions.append(f"inv.academic_year = ${idx}")
        params.append(academic_year)
        idx += 1
    if search and search.strip():
        conditions.append(
            f"(inv.invoice_number ILIKE ${idx} OR s.full_name ILIKE ${idx} OR s.learner_id ILIKE ${idx})"
        )
        params.append(f"%{search.strip()}%")
        idx += 1

    where = " AND ".join(conditions)
    offset = (page - 1) * limit
    count = await conn.fetchval(
        f"""
        SELECT COUNT(*)::int
        FROM invoices inv
        JOIN students s ON s.id = inv.student_id
        WHERE {where}
        """,
        *params,
    )

    from app.lib.receipt import format_class_name

    rows = await conn.fetch(
        f"""
        SELECT
          inv.id, inv.invoice_number, inv.invoice_date, inv.due_date, inv.term_name, inv.academic_year,
          inv.status, inv.total_amount, inv.amount_paid, inv.balance,
          s.full_name AS student_name, s.learner_id, sc.level, sc.stream
        FROM invoices inv
        JOIN students s ON s.id = inv.student_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE {where}
        ORDER BY inv.invoice_date DESC, inv.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    invoices = []
    for row in rows:
        item = dict(row)
        item["class_name"] = format_class_name(item.get("level") or "", item.get("stream"))
        item["total_amount"] = int(item["total_amount"])
        item["amount_paid"] = int(item["amount_paid"])
        item["balance"] = int(item["balance"])
        invoices.append(item)

    return {"invoices": invoices, "total": int(count or 0), "page": page, "limit": limit}


def _calc_total(items: list[dict[str, Any]]) -> int:
    total = 0
    for item in items:
        qty = int(item.get("quantity") or 1)
        unit = int(item["unit_amount"])
        total += qty * unit
    return total


async def _insert_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    fee_structure_id: uuid.UUID | None,
    due_date: date | None,
    term_name: str,
    academic_year: int,
    notes: str | None,
    items: list[dict[str, Any]],
) -> dict:
    total = _calc_total(items)
    if total <= 0:
        raise ValueError("Invoice total must be positive.")

    invoice_number = await generate_invoice_number(conn, school_id)
    invoice_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO invoices (
          id, school_id, student_id, fee_structure_id, invoice_number, due_date,
          term_name, academic_year, total_amount, notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        """,
        invoice_id,
        school_id,
        student_id,
        fee_structure_id,
        invoice_number,
        due_date,
        term_name,
        academic_year,
        total,
        notes,
        user_id,
    )
    for item in items:
        await conn.execute(
            """
            INSERT INTO invoice_items (id, school_id, invoice_id, account_id, description, quantity, unit_amount)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
            """,
            school_id,
            invoice_id,
            uuid.UUID(item["account_id"]) if item.get("account_id") else None,
            item["description"].strip(),
            int(item.get("quantity") or 1),
            int(item["unit_amount"]),
        )
    return {"id": str(invoice_id), "invoice_number": invoice_number, "total_amount": total}


async def create_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    body: dict[str, Any],
) -> dict:
    student_id = uuid.UUID(body["student_id"])
    async with conn.transaction():
        return await _insert_invoice(
            conn,
            school_id,
            user_id,
            student_id=student_id,
            fee_structure_id=uuid.UUID(body["fee_structure_id"]) if body.get("fee_structure_id") else None,
            due_date=_parse_date(body.get("due_date")),
            term_name=body["term_name"],
            academic_year=int(body["academic_year"]),
            notes=body.get("notes"),
            items=body["items"],
        )


async def bulk_create_invoices(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    body: dict[str, Any],
) -> dict:
    created = 0
    failed = 0
    errors: list[dict[str, str]] = []
    student_ids = [uuid.UUID(sid) for sid in body["student_ids"]]

    async with conn.transaction():
        for student_id in student_ids:
            try:
                await _insert_invoice(
                    conn,
                    school_id,
                    user_id,
                    student_id=student_id,
                    fee_structure_id=uuid.UUID(body["fee_structure_id"]) if body.get("fee_structure_id") else None,
                    due_date=_parse_date(body.get("due_date")),
                    term_name=body["term_name"],
                    academic_year=int(body["academic_year"]),
                    notes=body.get("notes"),
                    items=body["items"],
                )
                created += 1
            except Exception as exc:
                failed += 1
                errors.append({"student_id": str(student_id), "error": str(exc)})

    return {"created": created, "failed": failed, "errors": errors}


async def update_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    invoice_id: uuid.UUID,
    *,
    due_date: date | None,
    notes: str | None,
    items: list[dict[str, Any]] | None,
) -> dict | None:
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND school_id = $2 LIMIT 1",
        invoice_id,
        school_id,
    )
    if not inv or inv["status"] != "unpaid":
        return None

    async with conn.transaction():
        if items is not None:
            total = _calc_total(items)
            await conn.execute(
                "DELETE FROM invoice_items WHERE invoice_id = $1 AND school_id = $2",
                invoice_id,
                school_id,
            )
            for item in items:
                await conn.execute(
                    """
                    INSERT INTO invoice_items (id, school_id, invoice_id, account_id, description, quantity, unit_amount)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
                    """,
                    school_id,
                    invoice_id,
                    uuid.UUID(item["account_id"]) if item.get("account_id") else None,
                    item["description"].strip(),
                    int(item.get("quantity") or 1),
                    int(item["unit_amount"]),
                )
            await conn.execute(
                "UPDATE invoices SET total_amount = $3, updated_at = NOW() WHERE id = $1 AND school_id = $2",
                invoice_id,
                school_id,
                total,
            )

        await conn.execute(
            """
            UPDATE invoices
            SET due_date = COALESCE($3, due_date), notes = COALESCE($4, notes), updated_at = NOW()
            WHERE id = $1 AND school_id = $2
            """,
            invoice_id,
            school_id,
            due_date,
            notes,
        )

    return await get_invoice(conn, school_id, invoice_id)


async def cancel_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    invoice_id: uuid.UUID,
    user_id: uuid.UUID,
    reason: str,
) -> str:
    inv = await conn.fetchrow(
        "SELECT status, amount_paid FROM invoices WHERE id = $1 AND school_id = $2 LIMIT 1",
        invoice_id,
        school_id,
    )
    if not inv:
        return "not_found"
    if int(inv["amount_paid"]) > 0:
        return "has_payments"
    if inv["status"] != "unpaid":
        return "not_editable"

    await conn.execute(
        """
        UPDATE invoices
        SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3, cancel_reason = $4, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        invoice_id,
        school_id,
        user_id,
        reason.strip(),
    )
    return "cancelled"


async def recalculate_invoice(conn: asyncpg.Connection, invoice_id: uuid.UUID, school_id: uuid.UUID) -> None:
    paid_row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(amount), 0)::bigint AS paid
        FROM fee_payments
        WHERE invoice_id = $1 AND school_id = $2 AND voided = false
        """,
        invoice_id,
        school_id,
    )
    inv = await conn.fetchrow(
        "SELECT total_amount, status FROM invoices WHERE id = $1 AND school_id = $2 LIMIT 1",
        invoice_id,
        school_id,
    )
    if not inv:
        return
    paid = int(paid_row["paid"]) if paid_row else 0
    total = int(inv["total_amount"])
    new_status = _invoice_status(total, paid, inv["status"])
    await conn.execute(
        """
        UPDATE invoices SET amount_paid = $3, status = $4, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        invoice_id,
        school_id,
        paid,
        new_status,
    )


async def pay_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    invoice_id: uuid.UUID,
    *,
    amount: int,
    payment_method: str,
    payment_reference: str | None,
    payment_date: date,
    notes: str | None,
    recalculate_fee_account_fn,
) -> dict:
    inv = await get_invoice(conn, school_id, invoice_id)
    if not inv:
        raise ValueError("Invoice not found.")
    if inv["status"] in ("cancelled", "voided"):
        raise ValueError("Cannot pay a cancelled invoice.")
    balance = int(inv["balance"])
    if amount <= 0 or amount > balance:
        raise ValueError(f"Amount must be between 1 and {balance}.")

    student_id = uuid.UUID(str(inv["student_id"]))
    fee_structure_id = inv.get("fee_structure_id")

    async with conn.transaction():
        fee_account_id = None
        if fee_structure_id:
            account = await conn.fetchrow(
                """
                SELECT id FROM student_fee_accounts
                WHERE student_id = $1 AND fee_structure_id = $2 AND school_id = $3 LIMIT 1
                """,
                student_id,
                uuid.UUID(str(fee_structure_id)),
                school_id,
            )
            if account:
                fee_account_id = account["id"]

        if not fee_account_id:
            fs = await conn.fetchrow(
                """
                SELECT fs.id FROM fee_structures fs
                JOIN students s ON s.current_class_id = fs.class_id
                WHERE s.id = $1 AND fs.school_id = $2 AND fs.term_name = $3 AND fs.academic_year = $4
                LIMIT 1
                """,
                student_id,
                school_id,
                inv["term_name"],
                inv["academic_year"],
            )
            if fs:
                account = await conn.fetchrow(
                    """
                    SELECT id FROM student_fee_accounts
                    WHERE student_id = $1 AND fee_structure_id = $2 AND school_id = $3 LIMIT 1
                    """,
                    student_id,
                    fs["id"],
                    school_id,
                )
                fee_account_id = account["id"] if account else None

        if not fee_account_id:
            raise ValueError("No fee account linked to this invoice. Assign a fee structure first.")

        receipt_number = await generate_receipt_number(conn, school_id)
        payment_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO fee_payments (
              id, school_id, student_id, fee_account_id, receipt_number, amount,
              payment_method, payment_reference, payment_date, notes, recorded_by, invoice_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            """,
            payment_id,
            school_id,
            student_id,
            fee_account_id,
            receipt_number,
            amount,
            payment_method,
            payment_reference,
            payment_date,
            notes,
            user_id,
            invoice_id,
        )
        await recalculate_fee_account_fn(conn, fee_account_id)
        await recalculate_invoice(conn, invoice_id, school_id)

    updated = await get_invoice(conn, school_id, invoice_id)
    return {
        "payment_id": str(payment_id),
        "receipt_number": receipt_number,
        "invoice": updated,
    }


async def list_student_invoices(
    conn: asyncpg.Connection, school_id: uuid.UUID, student_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, invoice_number, invoice_date, due_date, term_name, academic_year,
               status, total_amount, amount_paid, balance
        FROM invoices
        WHERE school_id = $1 AND student_id = $2
        ORDER BY invoice_date DESC
        """,
        school_id,
        student_id,
    )
    result = []
    for row in rows:
        item = dict(row)
        item["total_amount"] = int(item["total_amount"])
        item["amount_paid"] = int(item["amount_paid"])
        item["balance"] = int(item["balance"])
        result.append(item)
    return result
