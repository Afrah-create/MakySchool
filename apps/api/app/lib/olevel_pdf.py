"""O-Level report card PDF generation (WeasyPrint) — A-level style, single page."""

from __future__ import annotations

import asyncio
import html
from typing import Any


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _src(value: Any) -> str:
    """Escape an image src. Keep data: URIs intact."""
    if value is None:
        return ""
    raw = str(value)
    return raw.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def _fmt_num(value: Any, digits: int = 1) -> str:
    if value is None or value == "":
        return "—"
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return _esc(value)


def build_olevel_report_html(data: dict[str, Any]) -> str:
    rules = data.get("reportRules") or {}
    subjects = data.get("subjectResults") or []
    totals = data.get("totals") or {}

    show_pct = rules.get("showPercentages", True)
    show_grade = rules.get("showGrades", True)
    show_pts = rules.get("showPoints", True)
    show_teacher = rules.get("showTeacherComment", True)
    show_head = rules.get("showHeadTeacherComment", True)
    report_title = rules.get("reportTitle") or "PROGRESS REPORT"

    rows = ""
    for s in subjects:
        cells = [
            f'<td class="code">{_esc(s.get("subjectCode") or "—")}</td>',
            f'<td class="subj-name">{_esc(s.get("subjectName"))}</td>',
        ]
        if show_pct:
            cells.append(f'<td class="num">{_fmt_num(s.get("assessmentPercent"))}</td>')
            cells.append(f'<td class="num">{_fmt_num(s.get("examPercent"))}</td>')
            cells.append(f'<td class="num">{_fmt_num(s.get("weightedScore"))}</td>')
        if show_grade:
            cells.append(
                f'<td class="num grade">{_esc(s.get("grade") or "—")}</td>'
            )
            cells.append(
                f'<td class="muted">{_esc(s.get("gradeLabel") or "—")}</td>'
            )
        if show_pts:
            cells.append(f'<td class="num">{_fmt_num(s.get("points"), 0)}</td>')
        rows += f"<tr>{''.join(cells)}</tr>"

    col_count = 2
    if show_pct:
        col_count += 3
    if show_grade:
        col_count += 2
    if show_pts:
        col_count += 1
    if not rows:
        rows = f'<tr><td colspan="{col_count}">No subject results recorded.</td></tr>'

    header_cells = ["<th>Code</th>", "<th>Subject</th>"]
    if show_pct:
        header_cells.extend(
            [
                '<th class="num">CA</th>',
                '<th class="num">Exam</th>',
                '<th class="num">Final %</th>',
            ]
        )
    if show_grade:
        header_cells.extend(['<th class="num">Grade</th>', "<th>Descriptor</th>"])
    if show_pts:
        header_cells.append('<th class="num">Pts</th>')

    logo_src = data.get("logoUrl")
    logo = (
        f'<img class="logo" src="{_src(logo_src)}" alt="" />'
        if logo_src
        else '<div class="logo-fallback">O</div>'
    )
    stamp_src = data.get("stampUrl")
    stamp = (
        f'<img class="stamp" src="{_src(stamp_src)}" alt="" />'
        if stamp_src
        else ""
    )

    photo = data.get("photoUrl")
    initials = _esc(data.get("studentInitials") or "?")
    avatar = (
        f'<img class="avatar-img" src="{_src(photo)}" alt="" />'
        if photo
        else f'<div class="avatar-initials">{initials}</div>'
    )

    pos = totals.get("classPosition")
    size = totals.get("totalStudentsInClass")
    rank = f"{pos} of {size}" if pos and size else (str(pos) if pos else "—")

    promoted = totals.get("isPromoted")
    if promoted is True:
        promo_label, promo_class = "Promoted", "pill-success"
    elif promoted is False:
        promo_label, promo_class = "Not promoted", "pill-warn"
    else:
        promo_label, promo_class = "—", "pill-muted"

    if data.get("approvedAt"):
        when = str(data["approvedAt"])[:10]
        who = data.get("approvedByName") or "Head teacher"
        approved = f"Approved by {_esc(who)} · {_esc(when)}"
    else:
        approved = "Pending approval"

    exam_bits = " · ".join(
        p
        for p in [
            data.get("termName"),
            data.get("academicYearName"),
            data.get("className"),
        ]
        if p
    )

    comments = ""
    if show_teacher:
        comments += f"""
        <h3>Class teacher comment</h3>
        <div class="box">{_esc(data.get('classTeacherComment') or '—')}</div>
        """
    if show_head:
        comments += f"""
        <h3>Head teacher comment</h3>
        <div class="box">{_esc(data.get('headTeacherComment') or '—')}</div>
        """

    footer_extra = _esc(rules.get("customFooterText") or "")

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{ size: A4; margin: 12mm 10mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0f172a;
    font-size: 10px;
    line-height: 1.35;
    margin: 0;
  }}
  table.layout, table.identity, table.summary, table.results {{
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }}
  table.layout {{
    margin-bottom: 10px;
    padding-bottom: 8px;
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
    margin-top: 2px;
    color: #64748b;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }}
  .logo-cell {{ text-align: right; width: 130px; }}
  .logo {{ height: 52px; max-width: 120px; object-fit: contain; }}
  .logo-fallback {{
    width: 48px; height: 48px; border-radius: 12px;
    background: #1e3a5f; color: #fff;
    text-align: center; line-height: 48px;
    font-weight: 700; font-size: 16px;
    display: inline-block;
  }}
  table.identity {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    margin-bottom: 10px;
  }}
  table.identity td {{ padding: 10px 12px; vertical-align: middle; }}
  .avatar-cell {{ width: 72px; padding-right: 0 !important; }}
  .avatar-img, .avatar-initials {{
    width: 56px; height: 56px; border-radius: 12px;
  }}
  .avatar-img {{ object-fit: cover; border: 2px solid #fff; }}
  .avatar-initials {{
    background: #dbeafe; color: #1e3a5f; font-weight: 700; font-size: 18px;
    text-align: center; line-height: 56px;
  }}
  .identity-name {{
    margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;
  }}
  .identity-meta {{ color: #64748b; margin-top: 2px; font-size: 10px; }}
  .chips {{ margin-top: 6px; }}
  .chip {{
    display: inline-block; padding: 2px 7px; border-radius: 999px;
    background: #fff; border: 1px solid #e2e8f0; font-size: 9.5px;
    margin-right: 5px; color: #334155;
  }}
  table.summary {{
    margin-bottom: 10px;
    border-spacing: 8px 0;
    width: calc(100% + 16px);
    margin-left: -8px;
  }}
  table.summary td.card {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 10px;
    width: 25%;
    vertical-align: top;
  }}
  .card .label {{
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #64748b; margin-bottom: 2px;
  }}
  .card .value {{ font-size: 14px; font-weight: 700; color: #0f172a; }}
  .pill {{
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 600;
  }}
  .pill-success {{ background: #dcfce7; color: #166534; }}
  .pill-warn {{ background: #fef3c7; color: #92400e; }}
  .pill-muted {{ background: #f1f5f9; color: #475569; }}
  table.results {{
    overflow: hidden;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin-bottom: 8px;
  }}
  table.results th, table.results td {{
    padding: 4px 6px;
    border-bottom: 1px solid #eef2f7;
  }}
  table.results th {{
    background: #1e3a5f; color: #fff; text-align: left;
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em;
  }}
  table.results tr:last-child td {{ border-bottom: none; }}
  .num {{ text-align: center; font-variant-numeric: tabular-nums; }}
  .grade {{ font-weight: 700; color: #1e3a5f; }}
  .code {{ font-weight: 700; color: #475569; width: 48px; }}
  .subj-name {{ font-weight: 600; font-size: 10px; }}
  .muted {{ color: #64748b; font-size: 9.5px; }}
  .comments h3 {{
    margin: 0 0 3px; font-size: 9.5px; color: #1e3a5f;
    text-transform: uppercase; letter-spacing: 0.05em;
  }}
  .box {{
    border: 1px solid #e2e8f0; min-height: 28px; padding: 6px 10px;
    border-radius: 8px; margin-bottom: 8px; background: #f8fafc;
  }}
  .footer {{
    margin-top: 10px; display: table; width: 100%;
    padding-top: 8px; border-top: 1px solid #e2e8f0;
    color: #64748b; font-size: 10px;
  }}
  .footer .left {{ display: table-cell; vertical-align: bottom; }}
  .footer .right {{ display: table-cell; text-align: right; vertical-align: bottom; }}
  .stamp {{ height: 56px; opacity: 0.9; object-fit: contain; }}
  .legend {{
    margin: 0 0 6px; color: #64748b; font-size: 9px;
  }}
</style></head>
<body>
  <table class="layout">
    <tr>
      <td>
        <div class="brand">
          <h1>{_esc(data.get('schoolName') or 'School')}</h1>
          <div class="eyebrow">{_esc(report_title)} · O-Level</div>
        </div>
      </td>
      <td class="logo-cell">{logo}</td>
    </tr>
  </table>

  <table class="identity">
    <tr>
      <td class="avatar-cell">{avatar}</td>
      <td>
        <div class="identity-name">{_esc(data.get('studentName'))}</div>
        <div class="identity-meta">{_esc(exam_bits)}</div>
        <div class="chips">
          <span class="chip">{_esc(data.get('learnerId') or '—')}</span>
          <span class="chip">{_esc(data.get('className') or '—')}</span>
        </div>
      </td>
    </tr>
  </table>

  <table class="summary">
    <tr>
      <td class="card">
        <div class="label">Total points</div>
        <div class="value">{_fmt_num(totals.get('totalPoints'), 0)}</div>
      </td>
      <td class="card">
        <div class="label">Average</div>
        <div class="value">{_fmt_num(totals.get('averagePercent'))}%</div>
      </td>
      <td class="card">
        <div class="label">Class rank</div>
        <div class="value">{_esc(rank)}</div>
      </td>
      <td class="card">
        <div class="label">Promotion</div>
        <div class="value"><span class="pill {promo_class}">{_esc(promo_label)}</span></div>
      </td>
    </tr>
  </table>

  <p class="legend">CA = average of selected continuous assessments (20%) · Exam = end-of-term (80%) · Final = weighted total</p>

  <table class="results">
    <thead><tr>{''.join(header_cells)}</tr></thead>
    <tbody>{rows}</tbody>
  </table>

  <div class="comments">{comments}</div>

  <div class="footer">
    <div class="left">{approved}{('<br/>' + footer_extra) if footer_extra else ''}</div>
    <div class="right">{stamp}</div>
  </div>
</body></html>"""


async def generate_olevel_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    html_str = build_olevel_report_html(data)
    return await asyncio.to_thread(lambda: HTML(string=html_str).write_pdf())
