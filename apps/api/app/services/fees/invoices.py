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
    from app.services.fees.allocations import load_invoice_item_balances

    return await load_invoice_item_balances(conn, school_id, invoice_id)


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


class DuplicateInvoiceError(Exception):
    """Raised when a student already has a live invoice for the same fees."""

    def __init__(self, invoice_number: str) -> None:
        self.invoice_number = invoice_number
        super().__init__(
            f"This student already has invoice {invoice_number} for these fees."
        )


async def _find_duplicate_invoice(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    fee_structure_id: uuid.UUID | None,
    term_name: str,
    academic_year: int,
    total: int,
) -> str | None:
    """A fee structure identifies the fees exactly. Ad-hoc invoices have no
    structure, so they only count as duplicates when term, year and amount match.
    """
    if fee_structure_id is not None:
        return await conn.fetchval(
            """
            SELECT invoice_number
            FROM invoices
            WHERE school_id = $1
              AND student_id = $2
              AND fee_structure_id = $3
              AND status NOT IN ('cancelled', 'voided')
            ORDER BY invoice_date DESC
            LIMIT 1
            """,
            school_id,
            student_id,
            fee_structure_id,
        )

    return await conn.fetchval(
        """
        SELECT invoice_number
        FROM invoices
        WHERE school_id = $1
          AND student_id = $2
          AND fee_structure_id IS NULL
          AND lower(term_name) = lower($3)
          AND academic_year = $4
          AND total_amount = $5
          AND status NOT IN ('cancelled', 'voided')
        ORDER BY invoice_date DESC
        LIMIT 1
        """,
        school_id,
        student_id,
        term_name,
        academic_year,
        total,
    )


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

    existing_number = await _find_duplicate_invoice(
        conn,
        school_id,
        student_id=student_id,
        fee_structure_id=fee_structure_id,
        term_name=term_name,
        academic_year=academic_year,
        total=total,
    )
    if existing_number:
        raise DuplicateInvoiceError(existing_number)

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
    skipped: list[dict[str, str]] = []
    student_ids = [uuid.UUID(sid) for sid in body["student_ids"]]

    for student_id in student_ids:
        try:
            async with conn.transaction():
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
        except DuplicateInvoiceError as exc:
            skipped.append({"student_id": str(student_id), "invoice_number": exc.invoice_number})
        except Exception as exc:
            failed += 1
            errors.append({"student_id": str(student_id), "error": str(exc)})

    return {
        "created": created,
        "skipped": len(skipped),
        "failed": failed,
        "errors": errors,
        "skipped_students": skipped,
    }


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
    allocations: list[dict[str, Any]] | None = None,
) -> dict:
    from app.services.fees.allocations import (
        insert_payment_allocations,
        validate_and_normalize_allocations,
    )

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
    normalized = await validate_and_normalize_allocations(
        conn, school_id, invoice_id, amount, allocations
    )

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
                  AND fs.deleted_at IS NULL
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

        receipt_number = await generate_receipt_number(school_id, conn)
        payment_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO fee_payments (
              id, school_id, student_id, fee_account_id, receipt_number, amount,
              payment_method, payment_reference, payment_date, notes, recorded_by, invoice_id,
              academic_year_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
              (
                SELECT COALESCE(fs.academic_year_id, ay.id)
                FROM student_fee_accounts sfa
                JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
                LEFT JOIN academic_years ay
                  ON ay.school_id = fs.school_id AND ay.year = fs.academic_year
                WHERE sfa.id = $4
                LIMIT 1
              )
            )
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
        if normalized:
            await insert_payment_allocations(
                conn,
                school_id=school_id,
                payment_id=payment_id,
                invoice_id=invoice_id,
                allocations=normalized,
            )
        await recalculate_fee_account_fn(conn, fee_account_id)
        await recalculate_invoice(conn, invoice_id, school_id)

    updated = await get_invoice(conn, school_id, invoice_id)
    return {
        "payment": {
            "id": str(payment_id),
            "receipt_number": receipt_number,
            "amount": amount,
            "allocations": normalized,
        },
        "invoice": updated,
    }


async def _allocate_invoice_numbers(
    conn: asyncpg.Connection, school_id: uuid.UUID, count: int
) -> list[str]:
    """Reserve `count` invoice numbers in one round-trip."""
    if count <= 0:
        return []
    from datetime import datetime

    year = datetime.now().year
    row = await conn.fetchrow(
        """
        INSERT INTO invoice_number_sequences (school_id, year, next_seq)
        VALUES ($1, $2, $3 + 1)
        ON CONFLICT (school_id, year) DO UPDATE
        SET next_seq = invoice_number_sequences.next_seq + $3
        RETURNING (next_seq - $3) AS start_seq
        """,
        school_id,
        year,
        count,
    )
    start = int(row["start_seq"]) if row else 1
    return [f"INV-{year}-{(start + i):04d}" for i in range(count)]


async def create_invoices_for_fee_structure(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    structure_id: uuid.UUID,
    class_id: uuid.UUID,
    amount: int,
    term_name: str,
    academic_year: int,
    description: str | None = None,
    due_date: date | None = None,
    items: list[dict[str, Any]] | None = None,
) -> int:
    """Create one school-fees invoice per active student who has an account
    for this structure but no non-cancelled invoice yet.

    Invoice line items are snapshotted from fee_structure_items (or a single
    fallback line when items is empty).
    """
    import logging

    log = logging.getLogger("makyschool")

    line_items = list(items or [])
    if not line_items:
        log.warning(
            "fee_structure %s has no items; falling back to single-line invoice",
            structure_id,
        )
        if amount <= 0:
            return 0
        line_description = (description or "").strip() or f"School fees — {term_name} {academic_year}"
        line_items = [
            {
                "description": line_description,
                "account_id": None,
                "amount": amount,
                "sort_order": 0,
            }
        ]

    total = sum(int(item["amount"]) for item in line_items)
    if total <= 0:
        return 0

    needing = await conn.fetch(
        """
        SELECT s.id AS student_id
        FROM students s
        JOIN student_fee_accounts sfa
          ON sfa.student_id = s.id AND sfa.fee_structure_id = $2
        WHERE s.school_id = $1
          AND s.current_class_id = $3
          AND s.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM invoices inv
            WHERE inv.student_id = s.id
              AND inv.fee_structure_id = $2
              AND inv.status NOT IN ('cancelled', 'voided')
          )
        ORDER BY s.full_name
        """,
        school_id,
        structure_id,
        class_id,
        timeout=60.0,
    )
    if not needing:
        return 0

    eligible: list[uuid.UUID] = []
    for row in needing:
        student_id = row["student_id"]
        existing_number = await _find_duplicate_invoice(
            conn,
            school_id,
            student_id=student_id,
            fee_structure_id=structure_id,
            term_name=term_name,
            academic_year=academic_year,
            total=total,
        )
        if existing_number:
            continue
        eligible.append(student_id)

    if not eligible:
        return 0

    invoice_ids = [uuid.uuid4() for _ in eligible]
    invoice_numbers = await _allocate_invoice_numbers(conn, school_id, len(eligible))
    student_ids = eligible
    due_dates = [due_date] * len(invoice_ids)
    totals = [total] * len(invoice_ids)
    term_names = [term_name] * len(invoice_ids)
    years = [academic_year] * len(invoice_ids)
    structure_ids = [structure_id] * len(invoice_ids)
    user_ids = [user_id] * len(invoice_ids)
    school_ids = [school_id] * len(invoice_ids)

    await conn.execute(
        """
        INSERT INTO invoices (
          id, school_id, student_id, fee_structure_id, invoice_number, due_date,
          term_name, academic_year, total_amount, notes, created_by
        )
        SELECT
          id, school_id, student_id, fee_structure_id, invoice_number, due_date,
          term_name, academic_year, total_amount, NULL, created_by
        FROM unnest(
          $1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::text[],
          $6::date[], $7::text[], $8::int[], $9::bigint[], $10::uuid[]
        ) AS t(
          id, school_id, student_id, fee_structure_id, invoice_number,
          due_date, term_name, academic_year, total_amount, created_by
        )
        """,
        invoice_ids,
        school_ids,
        student_ids,
        structure_ids,
        invoice_numbers,
        due_dates,
        term_names,
        years,
        totals,
        user_ids,
        timeout=90.0,
    )

    item_invoice_ids: list[uuid.UUID] = []
    item_school_ids: list[uuid.UUID] = []
    item_account_ids: list[str | None] = []
    item_descriptions: list[str] = []
    item_quantities: list[int] = []
    item_unit_amounts: list[int] = []

    for invoice_id in invoice_ids:
        for item in line_items:
            item_invoice_ids.append(invoice_id)
            item_school_ids.append(school_id)
            account = item.get("account_id")
            item_account_ids.append(str(account) if account else None)
            item_descriptions.append(str(item["description"]).strip())
            item_quantities.append(1)
            item_unit_amounts.append(int(item["amount"]))

    # Cast via text[] so all-null account_id arrays type-check in asyncpg.
    await conn.execute(
        """
        INSERT INTO invoice_items
          (id, school_id, invoice_id, account_id, description, quantity, unit_amount)
        SELECT
          gen_random_uuid(), school_id, invoice_id, account_id::uuid, description, quantity, unit_amount
        FROM unnest(
          $1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[], $6::bigint[]
        ) AS t(school_id, invoice_id, account_id, description, quantity, unit_amount)
        """,
        item_school_ids,
        item_invoice_ids,
        item_account_ids,
        item_descriptions,
        item_quantities,
        item_unit_amounts,
        timeout=90.0,
    )

    return len(invoice_ids)


async def list_student_invoices(
    conn: asyncpg.Connection, school_id: uuid.UUID, student_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, invoice_number, invoice_date, due_date, term_name, academic_year,
               status, total_amount, amount_paid, balance, fee_structure_id
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
        item["id"] = str(item["id"])
        if item.get("fee_structure_id") is not None:
            item["fee_structure_id"] = str(item["fee_structure_id"])
        item["total_amount"] = int(item["total_amount"])
        item["amount_paid"] = int(item["amount_paid"])
        item["balance"] = int(item["balance"])
        result.append(item)
    return result
