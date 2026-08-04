from __future__ import annotations

import html
import uuid
from datetime import datetime

import asyncpg

from app.lib.receipt import format_class_name, format_ugx


class ReceiptNotFoundError(Exception):
    pass


def _escape(value: str) -> str:
    return html.escape(str(value), quote=True)


def _src(value: str | None) -> str:
    """Escape an image src while keeping data: URIs intact for WeasyPrint."""
    if not value:
        return ""
    raw = str(value)
    return raw.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


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

    school_name = str(data.get("school_name") or "School")
    school_initial = _escape(school_name.strip()[:1].upper() or "S")
    meta_parts = [
        _escape(str(v))
        for v in (data.get("school_address"), data.get("school_phone"), data.get("school_email"))
        if v
    ]
    school_meta = " · ".join(meta_parts)

    logo_src = data.get("logo_url")
    logo_html = (
        f'<img class="logo" src="{_src(logo_src)}" alt="" />'
        if logo_src
        else f'<div class="logo-fallback">{school_initial}</div>'
    )
    stamp_src = data.get("stamp_url")
    stamp_html = (
        f'<img class="stamp" src="{_src(stamp_src)}" alt="" />'
        if stamp_src
        else '<div class="stamp-placeholder">Official stamp</div>'
    )

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
              <td class="num">{_escape(format_ugx(int(item.get("amount") or 0)))}</td>
            </tr>
            """
            for item in allocation_items
        )
        amount_col = "Paid now"
    elif line_items:
        rows_html = "".join(
            f"""
            <tr>
              <td><div class="item-name">{_escape(str(item.get("description") or "Fee item"))}</div></td>
              <td class="num">{_escape(format_ugx(int(item.get("amount") or 0)))}</td>
            </tr>
            """
            for item in line_items
        )
        amount_col = "Billed"
    else:
        rows_html = f"""
            <tr>
              <td><div class="item-name">School fees — {_escape(str(data["term_name"]))}</div></td>
              <td class="num">{_escape(format_ugx(int(data["amount"])))}</td>
            </tr>
            """
        amount_col = "Paid now"

    academic_year = data.get("academic_year")
    term_label = str(data["term_name"])
    if academic_year:
        term_label = f"{term_label} · {academic_year}"

    invoice_row = ""
    if data.get("invoice_number"):
        invoice_row = f"""
          <tr><td class="k">Invoice</td><td class="v">{_escape(str(data["invoice_number"]))}</td></tr>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: A4; margin: 14mm 12mm; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      position: relative;
      font-size: 11px;
      line-height: 1.4;
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

    table.layout, table.meta-bar, table.identity, table.items,
    table.totals, table.signatures, table.kv {{
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }}

    table.layout {{
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid #1e3a5f;
    }}
    table.layout td {{ vertical-align: middle; }}
    .brand h1 {{
      margin: 0;
      font-size: 18px;
      color: #1e3a5f;
      letter-spacing: -0.02em;
    }}
    .brand .eyebrow {{
      margin-top: 3px;
      color: #64748b;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 700;
    }}
    .brand .school-meta {{
      margin-top: 4px;
      color: #64748b;
      font-size: 10px;
    }}
    .logo-cell {{ text-align: right; width: 130px; }}
    .logo {{ height: 56px; max-width: 120px; object-fit: contain; }}
    .logo-fallback {{
      width: 52px; height: 52px; border-radius: 12px;
      background: #1e3a5f; color: #fff;
      text-align: center; line-height: 52px;
      font-weight: 700; font-size: 18px;
      display: inline-block;
    }}

    table.meta-bar {{
      margin-bottom: 12px;
      border-spacing: 8px 0;
      width: calc(100% + 16px);
      margin-left: -8px;
    }}
    table.meta-bar td.card {{
      width: 33.33%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 8px 10px;
      vertical-align: top;
    }}
    .card .label {{
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
      color: #64748b; margin-bottom: 2px;
    }}
    .card .value {{
      font-size: 12px; font-weight: 700; color: #0f172a;
      font-variant-numeric: tabular-nums;
    }}

    table.identity {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 14px;
    }}
    table.identity td {{ padding: 10px 12px; vertical-align: top; width: 50%; }}
    .identity-name {{
      margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #0f172a;
    }}
    table.kv td {{ padding: 2px 0; }}
    table.kv td.k {{ color: #64748b; width: 38%; font-size: 10px; }}
    table.kv td.v {{ font-weight: 600; text-align: right; font-size: 10.5px; }}

    .section-title {{
      margin: 0 0 6px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #1e3a5f;
    }}

    table.items {{
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 10px;
    }}
    table.items th, table.items td {{
      padding: 7px 10px;
      border-bottom: 1px solid #eef2f7;
    }}
    table.items th {{
      background: #1e3a5f; color: #fff; text-align: left;
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
    }}
    table.items tr:last-child td {{ border-bottom: none; }}
    table.items th.num, table.items td.num {{
      text-align: right; white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }}
    .item-name {{ font-weight: 600; }}
    .item-meta {{ font-size: 9.5px; color: #64748b; margin-top: 2px; }}

    table.totals {{
      margin-bottom: 8px;
    }}
    table.totals td {{
      padding: 5px 2px;
      font-size: 11px;
    }}
    table.totals td.k {{ color: #64748b; }}
    table.totals td.v {{
      text-align: right; font-weight: 600;
      font-variant-numeric: tabular-nums;
    }}
    table.totals tr.paid td {{
      padding-top: 8px; padding-bottom: 8px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }}
    table.totals tr.paid td.k {{ color: #1e3a5f; font-weight: 700; }}
    table.totals tr.paid td.v {{
      color: #1e3a5f; font-size: 15px; font-weight: 700;
    }}
    table.totals tr.balance td.v {{ color: #b45309; }}

    .recorded {{
      margin: 10px 0 4px;
      color: #64748b;
      font-size: 10px;
    }}
    .recorded strong {{ color: #334155; }}

    table.signatures {{
      margin-top: 28px;
    }}
    table.signatures td {{
      width: 50%;
      text-align: center;
      color: #64748b;
      font-size: 10.5px;
      vertical-align: bottom;
      padding: 0 16px;
    }}
    .sig-line {{
      border-top: 1px solid #94a3b8;
      margin: 40px 8px 6px;
    }}
    .stamp {{ height: 78px; max-width: 120px; object-fit: contain; }}
    .stamp-placeholder {{
      width: 88px; height: 88px; margin: 0 auto;
      border: 1.5px dashed #cbd5e1; border-radius: 50%;
      color: #94a3b8; font-size: 9px; text-transform: uppercase;
      letter-spacing: 0.04em; line-height: 88px; text-align: center;
    }}
    .stamp-caption {{ margin-top: 6px; }}

    .footer {{
      margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0;
      color: #94a3b8; font-size: 10px; text-align: center;
    }}
  </style>
</head>
<body>
  {voided_overlay}

  <table class="layout">
    <tr>
      <td class="brand">
        <h1>{_escape(school_name)}</h1>
        <div class="eyebrow">Official payment receipt</div>
        {f'<div class="school-meta">{school_meta}</div>' if school_meta else ""}
      </td>
      <td class="logo-cell">{logo_html}</td>
    </tr>
  </table>

  <table class="meta-bar">
    <tr>
      <td class="card">
        <div class="label">Receipt no.</div>
        <div class="value">{_escape(data["receipt_number"])}</div>
      </td>
      <td class="card">
        <div class="label">Date</div>
        <div class="value">{_escape(_format_date(data["payment_date"]))}</div>
      </td>
      <td class="card">
        <div class="label">Method</div>
        <div class="value">{_escape(_method_label(data["payment_method"]))}</div>
      </td>
    </tr>
  </table>

  <table class="identity">
    <tr>
      <td colspan="2">
        <div class="identity-name">{_escape(data["student_name"])}</div>
      </td>
    </tr>
    <tr>
      <td>
        <table class="kv">
          <tr><td class="k">Learner ID</td><td class="v">{_escape(data["learner_id"])}</td></tr>
          <tr><td class="k">Class</td><td class="v">{_escape(data["class_name"])}</td></tr>
        </table>
      </td>
      <td>
        <table class="kv">
          <tr><td class="k">Term</td><td class="v">{_escape(term_label)}</td></tr>
          <tr><td class="k">Reference</td><td class="v">{_escape(data.get("payment_reference") or "—")}</td></tr>
          {invoice_row}
        </table>
      </td>
    </tr>
  </table>

  <p class="section-title">Payment details</p>
  <table class="items">
    <thead>
      <tr><th>Fee category</th><th class="num">{amount_col}</th></tr>
    </thead>
    <tbody>{rows_html}</tbody>
  </table>

  <table class="totals">
    <tr>
      <td class="k">Total fees</td>
      <td class="v">{_escape(format_ugx(data["amount_owed"]))}</td>
    </tr>
    <tr>
      <td class="k">Previously paid</td>
      <td class="v">{_escape(format_ugx(data["previous_paid"]))}</td>
    </tr>
    <tr class="paid">
      <td class="k">Amount paid now</td>
      <td class="v">{_escape(format_ugx(data["amount"]))}</td>
    </tr>
    <tr class="balance">
      <td class="k">Outstanding balance</td>
      <td class="v">{_escape(format_ugx(data["balance"]))}</td>
    </tr>
  </table>

  <p class="recorded">Recorded by <strong>{_escape(data.get("recorded_by_name") or "—")}</strong></p>

  <table class="signatures">
    <tr>
      <td>
        <div class="sig-line"></div>
        Bursar signature
      </td>
      <td>
        {stamp_html}
        <div class="stamp-caption">School stamp</div>
      </td>
    </tr>
  </table>

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
    from app.lib.storage_urls import resolve_storage_data_uri

    data = await fetch_receipt_data(conn, payment_id, school_id)
    # Embed as data URIs so WeasyPrint does not need to fetch remote storage URLs.
    data["logo_url"] = await resolve_storage_data_uri(data.get("logo_url"), school_id=school_id)
    data["stamp_url"] = await resolve_storage_data_uri(data.get("stamp_url"), school_id=school_id)
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
        f'<img class="logo" src="{_src(data.get("logo_url"))}" alt="" />'
        if data.get("logo_url")
        else f'<div class="logo-fallback">{_escape(str(data.get("school_name") or "S")[:1].upper())}</div>'
    )
    stamp_html = (
        f'<img class="stamp" src="{_src(data.get("stamp_url"))}" alt="" />'
        if data.get("stamp_url")
        else ""
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
    from app.lib.storage_urls import resolve_storage_data_uri

    data = await fetch_invoice_data(conn, invoice_id, school_id)
    data["logo_url"] = await resolve_storage_data_uri(data.get("logo_url"), school_id=school_id)
    data["stamp_url"] = await resolve_storage_data_uri(data.get("stamp_url"), school_id=school_id)
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

    school_name = str(data.get("school_name") or "School")
    school_initial = _escape(school_name.strip()[:1].upper() or "S")
    rows = "".join(
        f"<tr><td>{_escape(i['description'])}</td><td class='num'>{_escape(format_ugx(int(i['amount'])))}</td></tr>"
        for i in data["items"]
    )
    meta = " · ".join(
        _escape(str(v))
        for v in (data.get("school_address"), data.get("school_phone"), data.get("school_email"))
        if v
    )
    logo_src = data.get("logo_url")
    logo_html = (
        f'<img class="logo" src="{_src(logo_src)}" alt="" />'
        if logo_src
        else f'<div class="logo-fallback">{school_initial}</div>'
    )
    stamp_src = data.get("stamp_url")
    stamp_html = (
        f'<img class="stamp" src="{_src(stamp_src)}" alt="" />'
        if stamp_src
        else '<div class="stamp-placeholder">Official stamp</div>'
    )

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  @page {{ size: A4; margin: 14mm 12mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #0f172a; margin: 0; position: relative;
    font-size: 11px; line-height: 1.4;
  }}
  table.layout, table.items, table.signatures, table.kv {{
    width: 100%; border-collapse: separate; border-spacing: 0;
  }}
  table.layout {{
    margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #1e3a5f;
  }}
  table.layout td {{ vertical-align: middle; }}
  .brand h1 {{ margin: 0; font-size: 18px; color: #1e3a5f; letter-spacing: -0.02em; }}
  .brand .eyebrow {{
    margin-top: 3px; color: #64748b; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.1em; font-weight: 700;
  }}
  .brand .school-meta {{ margin-top: 4px; color: #64748b; font-size: 10px; }}
  .logo-cell {{ text-align: right; width: 130px; }}
  .logo {{ height: 56px; max-width: 120px; object-fit: contain; }}
  .logo-fallback {{
    width: 52px; height: 52px; border-radius: 12px; background: #1e3a5f; color: #fff;
    text-align: center; line-height: 52px; font-weight: 700; font-size: 18px; display: inline-block;
  }}
  .section {{ margin-top: 16px; }}
  .section-title {{
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: #1e3a5f; margin: 0 0 6px;
  }}
  table.kv td {{ padding: 3px 0; }}
  table.kv td.k {{ color: #64748b; width: 30%; }}
  table.kv td.v {{ font-weight: 600; text-align: right; }}
  table.items {{ border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }}
  table.items th, table.items td {{ padding: 7px 10px; border-bottom: 1px solid #eef2f7; }}
  table.items th {{
    background: #1e3a5f; color: #fff; text-align: left;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
  }}
  table.items tr:last-child td {{ border-bottom: none; }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .summary {{
    margin-top: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 10px 12px;
  }}
  table.signatures {{ margin-top: 28px; }}
  table.signatures td {{
    width: 50%; text-align: center; color: #64748b; font-size: 10.5px;
    vertical-align: bottom; padding: 0 16px;
  }}
  .sig-line {{ border-top: 1px solid #94a3b8; margin: 40px 8px 6px; }}
  .stamp {{ height: 78px; max-width: 120px; object-fit: contain; }}
  .stamp-placeholder {{
    width: 88px; height: 88px; margin: 0 auto; border: 1.5px dashed #cbd5e1; border-radius: 50%;
    color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em;
    line-height: 88px; text-align: center;
  }}
  .stamp-caption {{ margin-top: 6px; }}
  .footer {{
    margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0;
    color: #94a3b8; font-size: 10px; text-align: center;
  }}
</style></head><body>{voided}
<table class="layout">
  <tr>
    <td class="brand">
      <h1>{_escape(school_name)}</h1>
      <div class="eyebrow">Other income receipt</div>
      {f'<div class="school-meta">{meta}</div>' if meta else ""}
    </td>
    <td class="logo-cell">{logo_html}</td>
  </tr>
</table>
<div class="section">
  <table class="kv">
    <tr><td class="k">Reference</td><td class="v">{_escape(data['reference_number'])}</td></tr>
    <tr><td class="k">Date</td><td class="v">{_escape(_format_date(data['income_date']))}</td></tr>
    <tr><td class="k">Source</td><td class="v">{_escape(data.get('source_name') or '—')}</td></tr>
    <tr><td class="k">Description</td><td class="v">{_escape(data['description'])}</td></tr>
  </table>
</div>
<div class="section">
  <p class="section-title">Line items</p>
  <table class="items"><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead><tbody>{rows}</tbody></table>
  <div class="summary">
    <table class="kv">
      <tr><td class="k">Total</td><td class="v">{_escape(format_ugx(int(data['total_amount'])))}</td></tr>
      <tr><td class="k">Method</td><td class="v">{_escape(_method_label(data['payment_method']))}</td></tr>
    </table>
  </div>
</div>
<table class="signatures">
  <tr>
    <td><div class="sig-line"></div>Received by</td>
    <td>{stamp_html}<div class="stamp-caption">School stamp</div></td>
  </tr>
</table>
<div class="footer">This receipt is proof of payment. Please keep it for your records.</div>
</body></html>"""


async def generate_other_income_receipt_pdf(
    conn: asyncpg.Connection, income_id: uuid.UUID, school_id: uuid.UUID
) -> tuple[bytes, str]:
    from app.lib.storage_urls import resolve_storage_data_uri

    data = await fetch_other_income_data(conn, income_id, school_id)
    data["logo_url"] = await resolve_storage_data_uri(data.get("logo_url"), school_id=school_id)
    data["stamp_url"] = await resolve_storage_data_uri(data.get("stamp_url"), school_id=school_id)
    from weasyprint import HTML

    pdf = HTML(string=build_other_income_html(data)).write_pdf()
    return pdf, data["reference_number"]
