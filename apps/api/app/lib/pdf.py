from __future__ import annotations

import html
import uuid
from datetime import datetime

import asyncpg

from app.lib.receipt import format_class_name, format_ugx


class ReceiptNotFoundError(Exception):
    pass


def _escape(value: str) -> str:
    return html.escape(value, quote=True)


def _format_date(value: str | datetime) -> str:
    if isinstance(value, datetime):
        date = value
    else:
        raw = str(value)
        if "T" not in raw and len(raw) == 10:
            date = datetime.strptime(raw, "%Y-%m-%d")
        else:
            date = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return f"{date.day} {date.strftime('%B %Y')}"


def _method_label(method: str) -> str:
    labels = {
        "bank_transfer": "Bank Transfer",
        "mobile_money": "Mobile Money",
        "cheque": "Cheque",
        "other": "Other",
    }
    return labels.get(method, "Cash")


def build_receipt_html(data: dict) -> str:
    voided_overlay = ""
    if data["voided"]:
        voided_overlay = """
        <div class="watermark">
          <div class="watermark-label voided">VOIDED</div>
        </div>
        """

    meta_parts = [
        _escape(str(v))
        for v in (data.get("school_address"), data.get("school_phone"), data.get("school_email"))
        if v
    ]
    meta = " · ".join(meta_parts)

    logo_html = ""
    if data.get("logo_url"):
        logo_html = f'<img class="logo" src="{_escape(data["logo_url"])}" alt="Logo" />'

    stamp_html = ""
    if data.get("stamp_url"):
        stamp_html = f'<img class="stamp" src="{_escape(data["stamp_url"])}" alt="Stamp" />'

    line_items = data.get("line_items") or []
    allocation_items = data.get("allocations") or []
    if allocation_items:
        rows_html = "".join(
            f"""
            <tr>
              <td>
                <div class="item-name">{_escape(str(item.get("description") or "Fee item"))}</div>
                <div class="item-meta">
                  Billed {_escape(format_ugx(int(item.get("item_total") or 0)))}
                  &nbsp;·&nbsp; Before {_escape(format_ugx(int(item.get("previous_paid") or 0)))}
                  &nbsp;·&nbsp; Balance {_escape(format_ugx(int(item.get("balance") or 0)))}
                </div>
              </td>
              <td class="num"><strong>{_escape(format_ugx(int(item.get("amount") or 0)))}</strong></td>
            </tr>
            """
            for item in allocation_items
        )
        fee_breakdown = f"""
        <table class="items">
          <thead>
            <tr><th>Fee category</th><th class="num">Paid now</th></tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
        """
    elif line_items:
        rows_html = "".join(
            f"""
            <tr>
              <td>{_escape(str(item.get("description") or "Fee item"))}</td>
              <td class="num">{_escape(format_ugx(int(item.get("amount") or 0)))}</td>
            </tr>
            """
            for item in line_items
        )
        fee_breakdown = f"""
        <table class="items">
          <thead>
            <tr><th>Fee category</th><th class="num">Billed</th></tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
        """
    else:
        fee_breakdown = f"""
        <div class="kv">
          <span class="label">Fee item</span>
          <span class="value">School Fees — {_escape(str(data["term_name"]))}</span>
        </div>
        """

    academic_year = data.get("academic_year")
    term_label = _escape(str(data["term_name"]))
    if academic_year:
        term_label = f"{term_label} {academic_year}"

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      margin: 0;
      padding: 16mm 18mm;
      position: relative;
      font-size: 13px;
      line-height: 1.45;
    }}
    .watermark {{
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 10;
    }}
    .watermark-label {{
      transform: rotate(-32deg); font-size: 64px; font-weight: 700;
      padding: 10px 40px; border: 5px solid;
    }}
    .watermark-label.voided {{ color: rgba(185,28,28,0.22); border-color: rgba(185,28,28,0.3); }}
    .header {{
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #111;
    }}
    .brand {{ display: flex; gap: 12px; align-items: flex-start; }}
    .logo, .stamp {{ width: 64px; height: 64px; object-fit: contain; }}
    .school-name {{ font-size: 20px; font-weight: 700; margin: 0 0 4px; letter-spacing: 0.2px; }}
    .meta {{ color: #555; font-size: 11px; }}
    .doc-meta {{ text-align: right; min-width: 150px; }}
    .doc-title {{
      font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
      color: #111; margin: 0 0 6px;
    }}
    .doc-number {{ font-size: 14px; font-weight: 700; }}
    .section {{ margin-top: 18px; }}
    .section-title {{
      font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
      color: #666; margin: 0 0 8px;
    }}
    .grid-2 {{ display: flex; gap: 24px; }}
    .grid-2 > div {{ flex: 1; }}
    .kv {{ display: flex; justify-content: space-between; gap: 12px; margin: 5px 0; }}
    .label {{ color: #666; }}
    .value {{ font-weight: 600; text-align: right; }}
    table.items {{ width: 100%; border-collapse: collapse; margin-top: 4px; }}
    table.items th {{
      text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
      color: #666; border-bottom: 1px solid #ddd; padding: 6px 4px;
    }}
    table.items td {{ padding: 8px 4px; border-bottom: 1px solid #f0f0f0; }}
    table.items th.num, table.items td.num {{ text-align: right; white-space: nowrap; }}
    .item-name {{ font-weight: 600; }}
    .item-meta {{ font-size: 10px; color: #777; margin-top: 2px; }}
    .summary {{
      margin-top: 16px; background: #f7f7f8; border: 1px solid #e5e5e7;
      border-radius: 8px; padding: 12px 14px;
    }}
    .summary .kv {{ margin: 6px 0; }}
    .summary .emphasis .value {{ font-size: 16px; }}
    .summary .balance .value {{ color: #b45309; }}
    .signatures {{
      display: flex; justify-content: space-between; gap: 32px; margin-top: 40px;
    }}
    .sig-line {{
      width: 42%; border-top: 1px solid #333; padding-top: 8px;
      font-size: 11px; text-align: center; color: #444;
    }}
    .footer {{
      margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e5e7;
      font-size: 10px; color: #777; text-align: center;
    }}
  </style>
</head>
<body>
  {voided_overlay}
  <div class="header">
    <div class="brand">
      {logo_html}
      <div>
        <h1 class="school-name">{_escape(data["school_name"])}</h1>
        <div class="meta">{meta}</div>
      </div>
    </div>
    <div class="doc-meta">
      <p class="doc-title">Official receipt</p>
      <div class="doc-number">{_escape(data["receipt_number"])}</div>
      <div class="meta" style="margin-top:4px">{_escape(_format_date(data["payment_date"]))}</div>
      {stamp_html}
    </div>
  </div>

  <div class="section">
    <p class="section-title">Student</p>
    <div class="grid-2">
      <div>
        <div class="kv"><span class="label">Name</span><span class="value">{_escape(data["student_name"])}</span></div>
        <div class="kv"><span class="label">Learner ID</span><span class="value">{_escape(data["learner_id"])}</span></div>
      </div>
      <div>
        <div class="kv"><span class="label">Class</span><span class="value">{_escape(data["class_name"])}</span></div>
        <div class="kv"><span class="label">Term</span><span class="value">{term_label}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Payment details</p>
    {f'<div class="kv"><span class="label">Invoice</span><span class="value">{_escape(str(data["invoice_number"]))}</span></div>' if data.get("invoice_number") else ""}
    {fee_breakdown}
    <div class="summary">
      <div class="kv"><span class="label">Total fees</span><span class="value">{_escape(format_ugx(data["amount_owed"]))}</span></div>
      <div class="kv"><span class="label">Previously paid</span><span class="value">{_escape(format_ugx(data["previous_paid"]))}</span></div>
      <div class="kv emphasis"><span class="label">Amount paid now</span><span class="value">{_escape(format_ugx(data["amount"]))}</span></div>
      <div class="kv balance"><span class="label">Outstanding balance</span><span class="value">{_escape(format_ugx(data["balance"]))}</span></div>
      <div class="kv"><span class="label">Method</span><span class="value">{_escape(_method_label(data["payment_method"]))}</span></div>
      <div class="kv"><span class="label">Reference</span><span class="value">{_escape(data.get("payment_reference") or "—")}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="kv"><span class="label">Recorded by</span><span class="value">{_escape(data.get("recorded_by_name") or "—")}</span></div>
  </div>

  <div class="signatures">
    <div class="sig-line">Bursar signature</div>
    <div class="sig-line">School stamp / received by</div>
  </div>
  <div class="footer">
    This receipt is proof of payment. Please keep it for your records.
  </div>
</body>
</html>"""


async def fetch_receipt_data(
    conn: asyncpg.Connection, payment_id: uuid.UUID, school_id: uuid.UUID
) -> dict:
    row = await conn.fetchrow(
        """
        SELECT
          fp.receipt_number,
          fp.payment_date,
          fp.amount,
          fp.payment_method,
          fp.payment_reference,
          fp.voided,
          fp.invoice_id,
          s.full_name AS student_name,
          s.learner_id,
          sc.level,
          sc.stream,
          fs.id AS fee_structure_id,
          fs.term_name,
          fs.academic_year,
          sfa.amount_owed,
          sfa.amount_paid,
          sfa.balance,
          COALESCE(recorder.name, recorder.full_name) AS recorded_by_name,
          sch.name AS school_name,
          sch.address AS school_address,
          sch.phone AS school_phone,
          sch.email AS school_email,
          sch.logo_url,
          sch.stamp_url
        FROM fee_payments fp
        JOIN students s ON s.id = fp.student_id
        JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
        JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN users recorder ON recorder.id = fp.recorded_by
        JOIN schools sch ON sch.id = fp.school_id
        WHERE fp.id = $1 AND fp.school_id = $2
        LIMIT 1
        """,
        payment_id,
        school_id,
    )
    if not row:
        raise ReceiptNotFoundError("NOT_FOUND")

    amount_paid = int(row["amount_paid"])
    amount = int(row["amount"])
    structure_id = row["fee_structure_id"]

    allocations: list[dict] = []
    try:
        from app.services.fees.allocations import load_payment_allocations

        allocations = await load_payment_allocations(conn, school_id, payment_id)
    except asyncpg.UndefinedTableError:
        allocations = []

    line_items: list[dict] = []
    if not allocations:
        try:
            item_rows = await conn.fetch(
                """
                SELECT description, amount
                FROM fee_structure_items
                WHERE fee_structure_id = $1 AND school_id = $2
                ORDER BY sort_order ASC, created_at ASC
                """,
                structure_id,
                school_id,
            )
            line_items = [
                {"description": r["description"], "amount": int(r["amount"])} for r in item_rows
            ]
        except asyncpg.UndefinedTableError:
            line_items = []

    invoice_number = None
    if row.get("invoice_id"):
        invoice_number = await conn.fetchval(
            "SELECT invoice_number FROM invoices WHERE id = $1 AND school_id = $2",
            row["invoice_id"],
            school_id,
        )

    return {
        "receipt_number": row["receipt_number"],
        "payment_date": row["payment_date"],
        "amount": amount,
        "payment_method": row["payment_method"],
        "payment_reference": row["payment_reference"],
        "voided": row["voided"],
        "student_name": row["student_name"],
        "learner_id": row["learner_id"],
        "class_name": format_class_name(row["level"] or "", row["stream"]),
        "term_name": row["term_name"],
        "academic_year": row["academic_year"],
        "amount_owed": int(row["amount_owed"]),
        "amount_paid": amount_paid,
        "balance": int(row["balance"]),
        "previous_paid": max(amount_paid - amount, 0),
        "recorded_by_name": row["recorded_by_name"],
        "school_name": row["school_name"],
        "school_address": row["school_address"],
        "school_phone": row["school_phone"],
        "school_email": row["school_email"],
        "logo_url": row["logo_url"],
        "stamp_url": row["stamp_url"],
        "line_items": line_items,
        "allocations": allocations,
        "invoice_number": invoice_number,
    }


async def generate_fee_receipt_pdf(
    conn: asyncpg.Connection, payment_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    from app.lib.storage_urls import resolve_storage_url

    data = await fetch_receipt_data(conn, payment_id, school_id)
    data["logo_url"] = await resolve_storage_url(data.get("logo_url"), school_id=school_id)
    data["stamp_url"] = await resolve_storage_url(data.get("stamp_url"), school_id=school_id)
    from weasyprint import HTML

    pdf = HTML(string=build_receipt_html(data)).write_pdf()
    return pdf, data["receipt_number"]


class InvoiceNotFoundError(Exception):
    pass


class OtherIncomeNotFoundError(Exception):
    pass


def _watermark(status: str) -> str:
    if status == "paid":
        color = "rgba(34,197,94,0.25)"
        label = "PAID"
    elif status == "cancelled":
        color = "rgba(220,38,38,0.25)"
        label = "CANCELLED"
    else:
        return ""
    return f"""
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:10;">
      <div style="transform:rotate(-35deg);font-size:72px;font-weight:700;color:{color};border:6px solid {color};padding:12px 48px;">{label}</div>
    </div>
    """


async def fetch_invoice_data(conn: asyncpg.Connection, invoice_id: uuid.UUID, school_id: uuid.UUID) -> dict:
    from app.lib.receipt import format_class_name

    row = await conn.fetchrow(
        """
        SELECT inv.*, s.full_name AS student_name, s.learner_id,
               sc.level, sc.stream, sg.full_name AS guardian_name, sg.phone AS guardian_phone,
               sch.name AS school_name, sch.address AS school_address, sch.phone AS school_phone,
               sch.email AS school_email, sch.logo_url, sch.stamp_url
        FROM invoices inv
        JOIN students s ON s.id = inv.student_id
        JOIN schools sch ON sch.id = inv.school_id
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
        WHERE inv.id = $1 AND inv.school_id = $2 LIMIT 1
        """,
        invoice_id,
        school_id,
    )
    if not row:
        raise InvoiceNotFoundError("NOT_FOUND")

    items = await conn.fetch(
        """
        SELECT description, quantity, unit_amount, total_amount
        FROM invoice_items WHERE invoice_id = $1 AND school_id = $2 ORDER BY created_at ASC
        """,
        invoice_id,
        school_id,
    )
    data = dict(row)
    data["class_name"] = format_class_name(data.get("level") or "", data.get("stream"))
    data["line_items"] = [dict(i) for i in items]
    return data


def build_invoice_html(data: dict) -> str:
    meta_parts = [
        _escape(str(v))
        for v in (data.get("school_address"), data.get("school_phone"), data.get("school_email"))
        if v
    ]
    meta = " · ".join(meta_parts)
    logo_html = (
        f'<img class="logo" src="{_escape(data["logo_url"])}" alt="Logo" />' if data.get("logo_url") else ""
    )
    stamp_html = (
        f'<img class="stamp" src="{_escape(data["stamp_url"])}" alt="Stamp" />' if data.get("stamp_url") else ""
    )
    rows_html = ""
    for item in data["line_items"]:
        rows_html += f"""
        <tr>
          <td>{_escape(item['description'])}</td>
          <td class="num">{item['quantity']}</td>
          <td class="num">{_escape(format_ugx(int(item['unit_amount'])))}</td>
          <td class="num">{_escape(format_ugx(int(item['total_amount'])))}</td>
        </tr>
        """

    due = _format_date(data["due_date"]) if data.get("due_date") else "—"
    guardian = data.get("guardian_name") or "—"
    phone = data.get("guardian_phone") or ""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0; padding: 16mm 18mm; position: relative;
    font-size: 13px; line-height: 1.45;
  }}
  .header {{
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #111;
  }}
  .brand {{ display: flex; gap: 12px; align-items: flex-start; }}
  .logo, .stamp {{ width: 64px; height: 64px; object-fit: contain; }}
  .school-name {{ font-size: 20px; font-weight: 700; margin: 0 0 4px; }}
  .meta {{ color: #555; font-size: 11px; }}
  .doc-meta {{ text-align: right; }}
  .doc-title {{
    font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 6px;
  }}
  .section {{ margin-top: 18px; }}
  .section-title {{
    font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: #666; margin: 0 0 8px;
  }}
  .kv {{ display: flex; justify-content: space-between; gap: 12px; margin: 5px 0; }}
  .label {{ color: #666; }}
  .value {{ font-weight: 600; text-align: right; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 4px; }}
  th {{
    text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    color: #666; border-bottom: 1px solid #ddd; padding: 6px 4px;
  }}
  td {{ padding: 8px 4px; border-bottom: 1px solid #f0f0f0; }}
  th.num, td.num {{ text-align: right; }}
  .summary {{
    margin-top: 14px; background: #f7f7f8; border: 1px solid #e5e5e7;
    border-radius: 8px; padding: 12px 14px;
  }}
</style></head><body>
{_watermark(data.get('status', ''))}
<div class="header">
  <div class="brand">{logo_html}<div><h1 class="school-name">{_escape(data['school_name'])}</h1><div class="meta">{meta}</div></div></div>
  <div class="doc-meta">
    <p class="doc-title">Invoice</p>
    <div style="font-size:14px;font-weight:700">{_escape(data['invoice_number'])}</div>
    {stamp_html}
  </div>
</div>
<div class="section">
  <p class="section-title">Bill to</p>
  <div class="kv"><span class="label">Student</span><span class="value">{_escape(data['student_name'])} ({_escape(data['learner_id'])})</span></div>
  <div class="kv"><span class="label">Class / term</span><span class="value">{_escape(data['class_name'])} · {_escape(data['term_name'])} {data['academic_year']}</span></div>
  <div class="kv"><span class="label">Guardian</span><span class="value">{_escape(guardian)}{(' · ' + _escape(phone)) if phone else ''}</span></div>
  <div class="kv"><span class="label">Invoice date</span><span class="value">{_escape(_format_date(data['invoice_date']))}</span></div>
  <div class="kv"><span class="label">Due date</span><span class="value">{_escape(due)}</span></div>
</div>
<div class="section">
  <p class="section-title">Line items</p>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
  <div class="summary">
    <div class="kv"><span class="label">Total</span><span class="value">{_escape(format_ugx(int(data['total_amount'])))}</span></div>
    <div class="kv"><span class="label">Amount paid</span><span class="value">{_escape(format_ugx(int(data['amount_paid'])))}</span></div>
    <div class="kv"><span class="label">Balance due</span><span class="value">{_escape(format_ugx(int(data['balance'])))}</span></div>
    <div class="kv"><span class="label">Status</span><span class="value">{_escape(str(data['status']).upper())}</span></div>
  </div>
</div>
</body></html>"""


async def generate_invoice_pdf(
    conn: asyncpg.Connection, invoice_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    from app.lib.storage_urls import resolve_storage_url

    data = await fetch_invoice_data(conn, invoice_id, school_id)
    data["logo_url"] = await resolve_storage_url(data.get("logo_url"), school_id=school_id)
    data["stamp_url"] = await resolve_storage_url(data.get("stamp_url"), school_id=school_id)
    from weasyprint import HTML

    pdf = HTML(string=build_invoice_html(data)).write_pdf()
    return pdf, data["invoice_number"]


async def fetch_other_income_data(
    conn: asyncpg.Connection, income_id: uuid.UUID, school_id: uuid.UUID
) -> dict:
    row = await conn.fetchrow(
        """
        SELECT oi.*, src.name AS source_name,
               sch.name AS school_name, sch.address AS school_address, sch.phone AS school_phone,
               sch.email AS school_email, sch.logo_url, sch.stamp_url
        FROM other_income oi
        JOIN schools sch ON sch.id = oi.school_id
        LEFT JOIN income_sources src ON src.id = oi.source_id
        WHERE oi.id = $1 AND oi.school_id = $2 LIMIT 1
        """,
        income_id,
        school_id,
    )
    if not row:
        raise OtherIncomeNotFoundError("NOT_FOUND")
    items = await conn.fetch(
        "SELECT description, amount FROM other_income_items WHERE other_income_id = $1 ORDER BY created_at ASC",
        income_id,
    )
    data = dict(row)
    data["items"] = [dict(i) for i in items]
    return data


def build_other_income_html(data: dict) -> str:
    voided = ""
    if data.get("voided"):
        voided = _watermark("cancelled").replace("CANCELLED", "VOIDED")
    rows = "".join(
        f"<tr><td>{_escape(i['description'])}</td><td class='num'>{_escape(format_ugx(int(i['amount'])))}</td></tr>"
        for i in data["items"]
    )
    meta = " · ".join(
        _escape(str(v))
        for v in (data.get("school_address"), data.get("school_phone"), data.get("school_email"))
        if v
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0; padding: 16mm 18mm; position: relative;
    font-size: 13px; line-height: 1.45;
  }}
  .header {{
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 14px; border-bottom: 2px solid #111;
  }}
  .school-name {{ font-size: 20px; font-weight: 700; margin: 0 0 4px; }}
  .meta {{ color: #555; font-size: 11px; }}
  .doc-title {{
    font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 6px;
  }}
  .section {{ margin-top: 18px; }}
  .section-title {{
    font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: #666; margin: 0 0 8px;
  }}
  .kv {{ display: flex; justify-content: space-between; gap: 12px; margin: 5px 0; }}
  .label {{ color: #666; }}
  .value {{ font-weight: 600; text-align: right; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{
    text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    color: #666; border-bottom: 1px solid #ddd; padding: 6px 4px;
  }}
  td {{ padding: 8px 4px; border-bottom: 1px solid #f0f0f0; }}
  td.num, th.num {{ text-align: right; }}
  .summary {{
    margin-top: 14px; background: #f7f7f8; border: 1px solid #e5e5e7;
    border-radius: 8px; padding: 12px 14px;
  }}
</style></head><body>{voided}
<div class="header">
  <div>
    <h1 class="school-name">{_escape(data['school_name'])}</h1>
    <div class="meta">{meta}</div>
  </div>
  <div style="text-align:right">
    <p class="doc-title">Other income receipt</p>
    <div style="font-size:14px;font-weight:700">{_escape(data['reference_number'])}</div>
  </div>
</div>
<div class="section">
  <div class="kv"><span class="label">Date</span><span class="value">{_escape(_format_date(data['income_date']))}</span></div>
  <div class="kv"><span class="label">Source</span><span class="value">{_escape(data.get('source_name') or '—')}</span></div>
  <div class="kv"><span class="label">Description</span><span class="value">{_escape(data['description'])}</span></div>
</div>
<div class="section">
  <p class="section-title">Line items</p>
  <table><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead><tbody>{rows}</tbody></table>
  <div class="summary">
    <div class="kv"><span class="label">Total</span><span class="value">{_escape(format_ugx(int(data['total_amount'])))}</span></div>
    <div class="kv"><span class="label">Method</span><span class="value">{_escape(_method_label(data['payment_method']))}</span></div>
  </div>
</div>
</body></html>"""


async def generate_other_income_receipt_pdf(
    conn: asyncpg.Connection, income_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    data = await fetch_other_income_data(conn, income_id, school_id)
    from weasyprint import HTML

    pdf = HTML(string=build_other_income_html(data)).write_pdf()
    return pdf, data["reference_number"]
