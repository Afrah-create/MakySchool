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
        else ""
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
              <th style="text-align:center">L</th>
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
            body_rows += f"""
            <tr>
              <td>
                <div class="subj-code">{_esc(s.get("subjectCode"))}</div>
                <div class="subj-name">{_esc(s.get("subjectName"))}</div>
              </td>
              <td class="num">{_esc(s.get("caPercentage") if s.get("caPercentage") is not None else "—")}</td>
              <td class="num">{_esc(s.get("examPercentage") if s.get("examPercentage") is not None else "—")}</td>
              <td class="num">{_esc(s.get("finalPercent") if s.get("finalPercent") is not None else "—")}</td>
              <td class="num grade">{_esc(s.get("grade") or "—")}</td>
              <td class="muted">{_esc(s.get("gradeLabel") or "—")}</td>
            </tr>
            """
        table = f"""
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th style="text-align:center">CA %</th>
              <th style="text-align:center">Exam %</th>
              <th style="text-align:center">Final %</th>
              <th style="text-align:center">Grade</th>
              <th>Label</th>
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
        summary = f"""
        <div class="summary">
          <div><span class="lbl">Average</span><strong>{_esc(totals.get("averagePercent") if totals.get("averagePercent") is not None else "—")}%</strong></div>
          <div><span class="lbl">Overall</span><strong>{_esc(totals.get("overallGrade") or "—")} · {_esc(totals.get("overallGradeLabel") or "")}</strong></div>
          <div><span class="lbl">Position</span><strong>{_esc(rank)}</strong></div>
          <div><span class="lbl">Attendance</span><strong>{_esc(att_disp)}</strong></div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{ size: A4; margin: 16mm 14mm; }}
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
    padding-bottom: 14px;
    border-bottom: 2px solid #1e3a5f;
    margin-bottom: 18px;
  }}
  .brand h1 {{ margin: 0; font-size: 20px; color: #1e3a5f; }}
  .brand .eyebrow {{ margin-top: 4px; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }}
  .logo, .logo-fallback {{
    width: 56px; height: 56px; border-radius: 10px; object-fit: cover;
  }}
  .logo-fallback {{
    display: flex; align-items: center; justify-content: center;
    background: #e2e8f0; color: #1e3a5f; font-weight: 700; font-size: 18px;
  }}
  .meta {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px;
    margin-bottom: 16px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;
  }}
  .meta .lbl {{ display: block; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.04em; }}
  .meta strong {{ font-size: 13px; }}
  .summary {{
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin: 14px 0 18px;
  }}
  .summary > div {{
    background: #f1f5f9; border-radius: 8px; padding: 10px 12px;
  }}
  .summary .lbl {{ display: block; font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 18px; }}
  th, td {{ padding: 8px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }}
  th {{ font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.04em; }}
  .num {{ text-align: center; font-variant-numeric: tabular-nums; }}
  .grade {{ font-weight: 700; color: #1e3a5f; }}
  .subj-code {{ font-size: 10px; color: #64748b; }}
  .subj-name {{ font-weight: 600; }}
  .muted {{ color: #64748b; }}
  .comments h3 {{ margin: 14px 0 6px; font-size: 12px; color: #1e3a5f; }}
  .box {{
    min-height: 42px; padding: 10px 12px; border: 1px solid #e2e8f0;
    border-radius: 8px; background: #fff;
  }}
  .footer {{
    margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end;
    color: #64748b; font-size: 11px;
  }}
  .stamp {{ width: 72px; height: auto; opacity: 0.85; }}
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="eyebrow">Primary report card</div>
      <h1>{_esc(data.get("schoolName") or "School")}</h1>
    </div>
    {logo}
  </div>

  <div class="meta">
    <div><span class="lbl">Learner</span><strong>{_esc(student.get("fullName"))}</strong></div>
    <div><span class="lbl">Learner ID</span><strong>{_esc(student.get("learnerId") or "—")}</strong></div>
    <div><span class="lbl">Class</span><strong>{_esc(student.get("className") or "—")}</strong></div>
    <div><span class="lbl">Term</span><strong>{_esc(data.get("termName"))} · {_esc(data.get("academicYear"))}</strong></div>
  </div>

  {summary}
  {table}

  <div class="comments">
    <h3>Class teacher comment</h3>
    <div class="box">{_esc(data.get("classTeacherComment") or "—")}</div>
    <h3>Head teacher comment</h3>
    <div class="box">{_esc(data.get("headTeacherComment") or "—")}</div>
  </div>

  <div class="footer">
    <div>Generated by MakySchool</div>
    {stamp}
  </div>
</body></html>"""


async def generate_primary_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    html_str = build_primary_report_html(data)
    return await asyncio.to_thread(lambda: HTML(string=html_str).write_pdf())
