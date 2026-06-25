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
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:10;">
          <div style="transform:rotate(-35deg);font-size:72px;font-weight:700;color:rgba(220,38,38,0.25);border:6px solid rgba(220,38,38,0.35);padding:12px 48px;">VOIDED</div>
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

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * {{ box-sizing: border-box; }}
    body {{ font-family: Arial, sans-serif; color: #111; margin: 0; padding: 20mm; position: relative; }}
    .header {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }}
    .logo, .stamp {{ width: 80px; height: 80px; object-fit: contain; }}
    .school-name {{ font-size: 22px; font-weight: 700; margin: 0; }}
    .meta {{ color: #555; font-size: 12px; margin-top: 4px; }}
    .title {{ text-align: center; font-size: 18px; font-weight: 700; margin: 24px 0 8px; letter-spacing: 1px; }}
    .divider {{ border-top: 1px solid #ccc; margin: 16px 0; }}
    .row {{ display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }}
    .label {{ color: #555; }}
    .value {{ font-weight: 600; text-align: right; }}
    .signatures {{ display: flex; justify-content: space-between; margin-top: 48px; }}
    .sig-line {{ width: 42%; border-top: 1px solid #333; padding-top: 8px; font-size: 12px; text-align: center; }}
    .footer {{ margin-top: 32px; font-size: 11px; color: #666; text-align: center; }}
  </style>
</head>
<body>
  {voided_overlay}
  <div class="header">
    <div>
      {logo_html}
      <h1 class="school-name">{_escape(data["school_name"])}</h1>
      <div class="meta">{meta}</div>
    </div>
    {stamp_html}
  </div>
  <div class="title">OFFICIAL PAYMENT RECEIPT</div>
  <div class="row"><span class="label">Receipt No:</span><span class="value">{_escape(data["receipt_number"])}</span></div>
  <div class="row"><span class="label">Date:</span><span class="value">{_escape(_format_date(data["payment_date"]))}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Student:</span><span class="value">{_escape(data["student_name"])}</span></div>
  <div class="row"><span class="label">Learner ID:</span><span class="value">{_escape(data["learner_id"])}</span></div>
  <div class="row"><span class="label">Class:</span><span class="value">{_escape(data["class_name"])}</span></div>
  <div class="row"><span class="label">Term:</span><span class="value">{_escape(data["term_name"])}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Fee Item:</span><span class="value">School Fees {_escape(data["term_name"])}</span></div>
  <div class="row"><span class="label">Total Fees:</span><span class="value">{_escape(format_ugx(data["amount_owed"]))}</span></div>
  <div class="row"><span class="label">Amount Paid:</span><span class="value">{_escape(format_ugx(data["amount"]))}</span></div>
  <div class="row"><span class="label">Previous Paid:</span><span class="value">{_escape(format_ugx(data["previous_paid"]))}</span></div>
  <div class="row"><span class="label">Outstanding Bal:</span><span class="value">{_escape(format_ugx(data["balance"]))}</span></div>
  <div class="row"><span class="label">Payment Method:</span><span class="value">{_escape(_method_label(data["payment_method"]))}</span></div>
  <div class="row"><span class="label">Reference:</span><span class="value">{_escape(data.get("payment_reference") or "—")}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Recorded by:</span><span class="value">{_escape(data.get("recorded_by_name") or "—")}</span></div>
  <div class="signatures">
    <div class="sig-line">Bursar Signature</div>
    <div class="sig-line">School Stamp</div>
  </div>
  <div class="footer">
    This receipt is proof of payment. Keep for your records.
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
          s.full_name AS student_name,
          s.learner_id,
          sc.level,
          sc.stream,
          fs.term_name,
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
        "amount_owed": int(row["amount_owed"]),
        "amount_paid": amount_paid,
        "balance": int(row["balance"]),
        "previous_paid": amount_paid - amount,
        "recorded_by_name": row["recorded_by_name"],
        "school_name": row["school_name"],
        "school_address": row["school_address"],
        "school_phone": row["school_phone"],
        "school_email": row["school_email"],
        "logo_url": row["logo_url"],
        "stamp_url": row["stamp_url"],
    }


async def generate_fee_receipt_pdf(
    conn: asyncpg.Connection, payment_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    data = await fetch_receipt_data(conn, payment_id, school_id)
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
          <td style="text-align:center">{item['quantity']}</td>
          <td style="text-align:right">{_escape(format_ugx(int(item['unit_amount'])))}</td>
          <td style="text-align:right">{_escape(format_ugx(int(item['total_amount'])))}</td>
        </tr>
        """

    due = _format_date(data["due_date"]) if data.get("due_date") else "—"
    guardian = data.get("guardian_name") or "—"
    phone = data.get("guardian_phone") or ""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body {{ font-family: Arial, sans-serif; color: #111; margin: 0; padding: 20mm; position: relative; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; }}
  .logo, .stamp {{ width: 80px; height: 80px; object-fit: contain; }}
  .school-name {{ font-size: 22px; font-weight: 700; margin: 0; }}
  .meta {{ color: #555; font-size: 12px; margin-top: 4px; }}
  .title {{ text-align: center; font-size: 18px; font-weight: 700; margin: 24px 0 8px; }}
  .divider {{ border-top: 1px solid #ccc; margin: 16px 0; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ border-bottom: 1px solid #eee; padding: 8px 4px; }}
  th {{ text-align: left; color: #555; font-size: 11px; text-transform: uppercase; }}
  .row {{ display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }}
</style></head><body>
{_watermark(data.get('status', ''))}
<div class="header"><div>{logo_html}<h1 class="school-name">{_escape(data['school_name'])}</h1><div class="meta">{meta}</div></div>{stamp_html}</div>
<div class="title">INVOICE</div>
<div class="row"><span>Invoice No:</span><strong>{_escape(data['invoice_number'])}</strong></div>
<div class="row"><span>Invoice Date:</span><span>{_escape(_format_date(data['invoice_date']))}</span></div>
<div class="row"><span>Due Date:</span><span>{_escape(due)}</span></div>
<div class="divider"></div>
<div class="row"><span>Student:</span><span>{_escape(data['student_name'])} ({_escape(data['learner_id'])})</span></div>
<div class="row"><span>Class:</span><span>{_escape(data['class_name'])} · {_escape(data['term_name'])} {data['academic_year']}</span></div>
<div class="row"><span>Guardian:</span><span>{_escape(guardian)}{(' · ' + _escape(phone)) if phone else ''}</span></div>
<div class="divider"></div>
<table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{rows_html}</tbody></table>
<div class="divider"></div>
<div class="row"><span>Total:</span><strong>{_escape(format_ugx(int(data['total_amount'])))}</strong></div>
<div class="row"><span>Amount Paid:</span><span>{_escape(format_ugx(int(data['amount_paid'])))}</span></div>
<div class="row"><span>Balance Due:</span><strong>{_escape(format_ugx(int(data['balance'])))}</strong></div>
<div class="row"><span>Status:</span><strong>{_escape(str(data['status']).upper())}</strong></div>
</body></html>"""


async def generate_invoice_pdf(
    conn: asyncpg.Connection, invoice_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    data = await fetch_invoice_data(conn, invoice_id, school_id)
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
        f"<tr><td>{_escape(i['description'])}</td><td style='text-align:right'>{_escape(format_ugx(int(i['amount'])))}</td></tr>"
        for i in data["items"]
    )
    meta = " · ".join(
        _escape(str(v)) for v in (data.get("school_address"), data.get("school_phone")) if v
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>body{{font-family:Arial,sans-serif;padding:20mm;position:relative}}table{{width:100%;border-collapse:collapse}}</style>
</head><body>{voided}
<h1>{_escape(data['school_name'])}</h1><p>{meta}</p>
<h2>Other Income Receipt</h2>
<p>Reference: <strong>{_escape(data['reference_number'])}</strong></p>
<p>Date: {_escape(_format_date(data['income_date']))}</p>
<p>Source: {_escape(data.get('source_name') or '—')}</p>
<p>{_escape(data['description'])}</p>
<table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>{rows}</tbody></table>
<p><strong>Total: {_escape(format_ugx(int(data['total_amount'])))}</strong></p>
<p>Method: {_escape(_method_label(data['payment_method']))}</p>
</body></html>"""


async def generate_other_income_receipt_pdf(
    conn: asyncpg.Connection, income_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    data = await fetch_other_income_data(conn, income_id, school_id)
    from weasyprint import HTML

    pdf = HTML(string=build_other_income_html(data)).write_pdf()
    return pdf, data["reference_number"]
