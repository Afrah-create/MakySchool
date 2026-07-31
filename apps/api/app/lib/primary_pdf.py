"""Primary report card PDF generation (WeasyPrint)."""

from __future__ import annotations

import asyncio
import html
from typing import Any


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def build_primary_report_html(data: dict[str, Any]) -> str:
    student = data.get("student") or {}
    totals = data.get("totals") or {}
    is_lower = bool(data.get("isLowerPrimary"))

    logo = (
        f'<img class="logo" src="{_esc(data.get("logoUrl"))}" alt="" />'
        if data.get("logoUrl")
        else '<div class="logo-fallback">P</div>'
    )
    stamp = (
        f'<img class="stamp" src="{_esc(data.get("stampUrl"))}" alt="" />'
        if data.get("stampUrl")
        else '<div class="stamp-placeholder">Official stamp</div>'
    )

    photo = data.get("photoUrl") or student.get("photoUrl")
    initials = _esc(data.get("studentInitials") or "?")
    avatar = (
        f'<img class="avatar-img" src="{_esc(photo)}" alt="" />'
        if photo
        else f'<div class="avatar-initials">{initials}</div>'
    )

    exam_bits = " · ".join(
        p
        for p in [
            data.get("examName"),
            data.get("examTypeName"),
            data.get("termName"),
            data.get("academicYear"),
        ]
        if p
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
        <table>
          <thead>
            <tr>
              <th>Theme</th>
              <th>Strand</th>
              <th style="text-align:center">Level</th>
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
            body_rows += f"""
            <tr>
              <td>
                <div class="subj-code">{_esc(s.get("subjectCode"))}{" · agg" if s.get("isPleSubject") else ""}</div>
                <div class="subj-name">{_esc(s.get("subjectName"))}</div>
              </td>
              <td class="num">{_esc(s.get("examScore") if s.get("examScore") is not None else "—")}</td>
              <td class="num">{_esc(s.get("finalPercent") if s.get("finalPercent") is not None else "—")}</td>
              <td class="num grade">{_esc(s.get("grade") or "—")}</td>
              <td class="num">{_esc(pts_disp)}</td>
              <td class="muted">{_esc(s.get("gradeLabel") or "—")}</td>
            </tr>
            """
        table = f"""
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th style="text-align:center">Score</th>
              <th style="text-align:center">%</th>
              <th style="text-align:center">Grade</th>
              <th style="text-align:center">Pts</th>
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
        <div class="summary">
          <div class="card">
            <div class="label">Aggregate</div>
            <div class="value">{_esc(agg if agg is not None else "—")}</div>
            <div class="hint">Lower is better (4–36)</div>
          </div>
          <div class="card">
            <div class="label">Division</div>
            <div class="value">{_esc(div_label)}</div>
          </div>
          <div class="card">
            <div class="label">Class rank</div>
            <div class="value">{_esc(rank)}</div>
          </div>
          <div class="card">
            <div class="label">Attendance</div>
            <div class="value">{_esc(att_disp)}</div>
          </div>
        </div>
        """

    school_meta = " · ".join(
        p for p in [data.get("schoolAddress"), data.get("schoolPhone"), data.get("schoolEmail")] if p
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
  .header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 3px solid #1e3a5f;
    margin-bottom: 16px;
  }}
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
  .logo {{ height: 64px; max-width: 140px; object-fit: contain; }}
  .logo-fallback {{
    width: 56px; height: 56px; border-radius: 14px;
    background: #1e3a5f; color: #fff; display: flex;
    align-items: center; justify-content: center;
    font-weight: 700; font-size: 18px;
  }}
  .identity {{
    display: flex; gap: 14px; align-items: center;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;
  }}
  .avatar-img, .avatar-initials {{
    width: 72px; height: 72px; border-radius: 16px; flex-shrink: 0;
  }}
  .avatar-img {{ object-fit: cover; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(15,23,42,0.12); }}
  .avatar-initials {{
    display: flex; align-items: center; justify-content: center;
    background: #dbeafe; color: #1e3a5f; font-weight: 700; font-size: 22px;
  }}
  .identity h2 {{ margin: 0; font-size: 17px; color: #0f172a; }}
  .meta {{ color: #64748b; margin-top: 4px; font-size: 11px; }}
  .chips {{ margin-top: 8px; }}
  .chip {{
    display: inline-block; padding: 3px 9px; border-radius: 999px;
    background: #fff; border: 1px solid #e2e8f0; font-size: 10.5px;
    margin-right: 6px; color: #334155;
  }}
  .summary {{
    display: flex; gap: 10px; margin-bottom: 16px;
  }}
  .card {{
    flex: 1; background: #fff; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 10px 12px;
  }}
  .card .label {{
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #64748b; margin-bottom: 4px;
  }}
  .card .value {{ font-size: 18px; font-weight: 700; color: #0f172a; }}
  .card .hint {{ font-size: 9.5px; color: #94a3b8; margin-top: 2px; }}
  table {{
    width: 100%; border-collapse: separate; border-spacing: 0;
    margin-top: 4px; overflow: hidden;
    border: 1px solid #e2e8f0; border-radius: 12px;
  }}
  th, td {{ padding: 9px 10px; border-bottom: 1px solid #eef2f7; }}
  th {{
    background: #1e3a5f; color: #fff; text-align: left;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
  }}
  tr:last-child td {{ border-bottom: none; }}
  .num {{ text-align: center; font-variant-numeric: tabular-nums; }}
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
  .signatures {{
    margin-top: 22px; display: flex; justify-content: space-between;
    gap: 24px; align-items: flex-end;
  }}
  .sig {{
    flex: 1; text-align: center; color: #64748b; font-size: 10.5px;
  }}
  .sig-line {{
    border-top: 1px solid #94a3b8; margin: 36px 12px 6px;
  }}
  .stamp {{ height: 78px; max-width: 120px; object-fit: contain; opacity: 0.95; }}
  .stamp-placeholder {{
    width: 88px; height: 88px; margin: 0 auto;
    border: 1.5px dashed #cbd5e1; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em;
  }}
  .footer {{
    margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0;
    color: #94a3b8; font-size: 10px; text-align: center;
  }}
</style></head>
<body>
  <div class="header">
    <div class="brand">
      <h1>{_esc(data.get("schoolName") or "School")}</h1>
      <div class="eyebrow">Primary progress report</div>
      {f'<div class="school-meta">{_esc(school_meta)}</div>' if school_meta else ""}
    </div>
    {logo}
  </div>

  <div class="identity">
    <div class="avatar">{avatar}</div>
    <div>
      <h2>{_esc(student.get("fullName"))}</h2>
      <div class="meta">{_esc(exam_bits or "Term report")}</div>
      <div class="chips">
        <span class="chip">{_esc(student.get("learnerId") or "—")}</span>
        <span class="chip">{_esc(student.get("className") or "—")}</span>
        {f'<span class="chip">{_esc(student.get("gender"))}</span>' if student.get("gender") else ""}
      </div>
    </div>
  </div>

  {summary}
  {table}

  <div class="comments">
    <h3>Class teacher comment</h3>
    <div class="box">{_esc(data.get("classTeacherComment") or "—")}</div>
    <h3>Head teacher comment</h3>
    <div class="box">{_esc(data.get("headTeacherComment") or "—")}</div>
  </div>

  <div class="signatures">
    <div class="sig">
      <div class="sig-line"></div>
      Class teacher
    </div>
    <div class="sig">
      {stamp}
      <div style="margin-top:6px">School stamp</div>
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      Head teacher
    </div>
  </div>

  <div class="footer">Generated by MakySchool · Keep this report for your records</div>
</body></html>"""


async def generate_primary_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    html_str = build_primary_report_html(data)
    return await asyncio.to_thread(lambda: HTML(string=html_str).write_pdf())
