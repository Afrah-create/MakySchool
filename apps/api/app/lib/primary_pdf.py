"""Primary report card PDF generation (WeasyPrint)."""

from __future__ import annotations

import asyncio
import html
from typing import Any


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _src(value: Any) -> str:
    """Escape an image src. Keep data: URIs intact (only quote-sensitive chars)."""
    if value is None:
        return ""
    raw = str(value)
    # Do not use html.escape — it is unnecessary for base64 and can confuse some engines.
    return raw.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def _join_bits(*parts: Any) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        if part is None:
            continue
        text = str(part).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return " · ".join(out)


def build_primary_report_html(data: dict[str, Any]) -> str:
    student = data.get("student") or {}
    totals = data.get("totals") or {}
    is_lower = bool(data.get("isLowerPrimary"))

    logo_src = data.get("logoUrl")
    logo = (
        f'<img class="logo" src="{_src(logo_src)}" alt="" />'
        if logo_src
        else '<div class="logo-fallback">P</div>'
    )
    stamp_src = data.get("stampUrl")
    stamp = (
        f'<img class="stamp" src="{_src(stamp_src)}" alt="" />'
        if stamp_src
        else '<div class="stamp-placeholder">Official stamp</div>'
    )

    photo = data.get("photoUrl") or student.get("photoUrl")
    initials = _esc(data.get("studentInitials") or "?")
    avatar = (
        f'<img class="avatar-img" src="{_src(photo)}" alt="" />'
        if photo
        else f'<div class="avatar-initials">{initials}</div>'
    )

    # Prefer type + class + term + year; drop redundant exam title duplicates.
    exam_bits = _join_bits(
        data.get("examTypeName") or data.get("examName"),
        student.get("className"),
        data.get("termName"),
        data.get("academicYear"),
    )

    if is_lower:
        body_rows = ""
        for theme in data.get("thematicResults") or []:
            strands = theme.get("strands") or []
            for s in strands:
                body_rows += f"""
                <tr>
                  <td>{_esc(theme.get("theme"))}</td>
                  <td>{_esc(s.get("strand"))}</td>
                  <td class="num">{_esc(s.get("level"))}</td>
                  <td>{_esc(s.get("label") or "—")}</td>
                  <td class="muted">{_esc(s.get("teacherComment") or "—")}</td>
                </tr>
                """
        table = f"""
        <table class="results">
          <thead>
            <tr>
              <th>Theme</th>
              <th>Strand</th>
              <th class="num">Level</th>
              <th>Descriptor</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>{body_rows or '<tr><td colspan="5">No thematic assessments recorded.</td></tr>'}</tbody>
        </table>
        """
        summary = ""
    else:
        body_rows = ""
        for s in data.get("subjectResults") or []:
            pts = s.get("gradePoints")
            pts_disp = "—" if pts is None else pts
            code = _esc(s.get("subjectCode"))
            agg_tag = " · agg" if s.get("isPleSubject") else ""
            score_disp = (
                _esc(s.get("examScore")) if s.get("examScore") is not None else "—"
            )
            pct_disp = (
                _esc(s.get("finalPercent")) if s.get("finalPercent") is not None else "—"
            )
            body_rows += f"""
            <tr>
              <td>
                <div class="subj-code">{code}{agg_tag}</div>
                <div class="subj-name">{_esc(s.get("subjectName"))}</div>
              </td>
              <td class="num">{score_disp}</td>
              <td class="num">{pct_disp}</td>
              <td class="num grade">{_esc(s.get("grade") or "—")}</td>
              <td class="num">{_esc(pts_disp)}</td>
              <td class="muted">{_esc(s.get("gradeLabel") or "—")}</td>
            </tr>
            """
        table = f"""
        <table class="results">
          <thead>
            <tr>
              <th>Subject</th>
              <th class="num">Score</th>
              <th class="num">%</th>
              <th class="num">Grade</th>
              <th class="num">Pts</th>
              <th>Descriptor</th>
            </tr>
          </thead>
          <tbody>{body_rows or '<tr><td colspan="6">No subject results yet.</td></tr>'}</tbody>
        </table>
        """
        pos = totals.get("classPosition")
        size = totals.get("totalStudents")
        rank = f"{pos} of {size}" if pos and size else "—"
        att = totals.get("attendancePercent")
        att_disp = f"{att}%" if att is not None else "—"
        agg = totals.get("aggregate")
        div = totals.get("division")
        div_label = f"Division {div}" if div else (totals.get("overallGradeLabel") or "—")
        summary = f"""
        <table class="summary">
          <tr>
            <td class="card">
              <div class="label">Aggregate</div>
              <div class="value">{_esc(agg if agg is not None else "—")}</div>
              <div class="hint">Lower is better (4–36)</div>
            </td>
            <td class="card">
              <div class="label">Division</div>
              <div class="value">{_esc(div_label)}</div>
            </td>
            <td class="card">
              <div class="label">Class rank</div>
              <div class="value">{_esc(rank)}</div>
            </td>
            <td class="card">
              <div class="label">Attendance</div>
              <div class="value">{_esc(att_disp)}</div>
            </td>
          </tr>
        </table>
        """

    school_meta = _join_bits(
        data.get("schoolAddress"),
        data.get("schoolPhone"),
        data.get("schoolEmail"),
    )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{ size: A4; margin: 14mm 12mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0f172a;
    font-size: 11.5px;
    line-height: 1.45;
    margin: 0;
  }}

  /* Tables are more reliable than flex in WeasyPrint */
  table.layout, table.identity, table.summary, table.signatures, table.results {{
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }}

  table.layout {{
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 3px solid #1e3a5f;
  }}
  table.layout td {{ vertical-align: middle; }}
  .brand h1 {{
    margin: 0;
    font-size: 20px;
    color: #1e3a5f;
    letter-spacing: -0.02em;
  }}
  .brand .eyebrow {{
    margin-top: 3px;
    color: #64748b;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }}
  .brand .school-meta {{
    margin-top: 4px;
    color: #64748b;
    font-size: 10px;
  }}
  .logo-cell {{ text-align: right; width: 150px; }}
  .logo {{ height: 64px; max-width: 140px; object-fit: contain; }}
  .logo-fallback {{
    width: 56px; height: 56px; border-radius: 14px;
    background: #1e3a5f; color: #fff;
    text-align: center; line-height: 56px;
    font-weight: 700; font-size: 18px;
    display: inline-block;
  }}

  table.identity {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    margin-bottom: 14px;
  }}
  table.identity td {{
    padding: 14px 16px;
    vertical-align: middle;
  }}
  .avatar-cell {{ width: 88px; padding-right: 0 !important; }}
  .avatar-img, .avatar-initials {{
    width: 72px; height: 72px; border-radius: 16px;
  }}
  .avatar-img {{
    object-fit: cover;
    border: 2px solid #fff;
  }}
  .avatar-initials {{
    background: #dbeafe; color: #1e3a5f; font-weight: 700; font-size: 22px;
    text-align: center; line-height: 72px;
  }}
  .identity-name {{
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.25;
  }}
  .identity-meta {{
    color: #64748b;
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.35;
  }}
  .chips {{ margin-top: 8px; }}
  .chip {{
    display: inline-block; padding: 3px 9px; border-radius: 999px;
    background: #fff; border: 1px solid #e2e8f0; font-size: 10.5px;
    margin-right: 6px; color: #334155;
  }}

  table.summary {{
    margin-bottom: 16px;
    border-spacing: 10px 0;
    width: calc(100% + 20px);
    margin-left: -10px;
  }}
  table.summary td.card {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 10px 12px;
    width: 25%;
    vertical-align: top;
  }}
  .card .label {{
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #64748b; margin-bottom: 4px;
  }}
  .card .value {{ font-size: 18px; font-weight: 700; color: #0f172a; }}
  .card .hint {{ font-size: 9.5px; color: #94a3b8; margin-top: 2px; }}

  table.results {{
    margin-top: 4px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
  }}
  table.results th, table.results td {{
    padding: 9px 10px;
    border-bottom: 1px solid #eef2f7;
  }}
  table.results th {{
    background: #1e3a5f; color: #fff; text-align: left;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
  }}
  table.results th.num, table.results td.num {{ text-align: center; }}
  table.results tr:last-child td {{ border-bottom: none; }}
  .num {{ font-variant-numeric: tabular-nums; }}
  .grade {{ font-weight: 700; color: #1e3a5f; }}
  .subj-code {{ font-size: 10px; color: #64748b; font-weight: 600; }}
  .subj-name {{ font-weight: 600; }}
  .muted {{ color: #64748b; }}

  .comments {{ margin-top: 18px; }}
  .comments h3 {{
    margin: 0 0 6px; font-size: 11px; color: #1e3a5f;
    text-transform: uppercase; letter-spacing: 0.05em;
  }}
  .box {{
    border: 1px solid #e2e8f0; min-height: 44px; padding: 10px 12px;
    border-radius: 10px; margin-bottom: 12px; background: #f8fafc;
  }}

  table.signatures {{
    margin-top: 22px;
  }}
  table.signatures td {{
    width: 33%;
    text-align: center;
    color: #64748b;
    font-size: 10.5px;
    vertical-align: bottom;
    padding: 0 8px;
  }}
  .sig-line {{
    border-top: 1px solid #94a3b8;
    margin: 36px 12px 6px;
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
    margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0;
    color: #94a3b8; font-size: 10px; text-align: center;
  }}
</style></head>
<body>
  <table class="layout">
    <tr>
      <td class="brand">
        <h1>{_esc(data.get("schoolName") or "School")}</h1>
        <div class="eyebrow">Primary progress report</div>
        {f'<div class="school-meta">{_esc(school_meta)}</div>' if school_meta else ""}
      </td>
      <td class="logo-cell">{logo}</td>
    </tr>
  </table>

  <table class="identity">
    <tr>
      <td class="avatar-cell">{avatar}</td>
      <td>
        <div class="identity-name">{_esc(student.get("fullName"))}</div>
        <div class="identity-meta">{_esc(exam_bits or "Term report")}</div>
        <div class="chips">
          <span class="chip">{_esc(student.get("learnerId") or "—")}</span>
          <span class="chip">{_esc(student.get("className") or "—")}</span>
          {f'<span class="chip">{_esc(student.get("gender"))}</span>' if student.get("gender") else ""}
        </div>
      </td>
    </tr>
  </table>

  {summary}
  {table}

  <div class="comments">
    <h3>Class teacher comment</h3>
    <div class="box">{_esc(data.get("classTeacherComment") or "—")}</div>
    <h3>Head teacher comment</h3>
    <div class="box">{_esc(data.get("headTeacherComment") or "—")}</div>
  </div>

  <table class="signatures">
    <tr>
      <td>
        <div class="sig-line"></div>
        Class teacher
      </td>
      <td>
        {stamp}
        <div class="stamp-caption">School stamp</div>
      </td>
      <td>
        <div class="sig-line"></div>
        Head teacher
      </td>
    </tr>
  </table>

  <div class="footer">Generated by MakySchool · Keep this report for your records</div>
</body></html>"""


async def generate_primary_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    html_str = build_primary_report_html(data)
    try:
        return await asyncio.to_thread(lambda: HTML(string=html_str).write_pdf())
    except Exception as exc:
        raise RuntimeError(f"WeasyPrint failed to render primary report: {exc}") from exc
