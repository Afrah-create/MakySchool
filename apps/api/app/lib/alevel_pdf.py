"""A-Level report card PDF generation (WeasyPrint)."""

from __future__ import annotations

import asyncio
import html
from typing import Any


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def build_alevel_report_html(data: dict[str, Any]) -> str:
    rows = ""
    for s in data.get("subjects") or []:
        score = s.get("rawScore")
        score_disp = "—" if score is None else score
        pts = s.get("points")
        pts_disp = "—" if pts is None else pts
        rows += f"""
        <tr>
          <td>
            <div class="subj-code">{_esc(s.get('code'))}</div>
            <div class="subj-name">{_esc(s.get('subjectName'))}</div>
          </td>
          <td class="num">{_esc(score_disp)}</td>
          <td class="num grade">{_esc(s.get('grade') or '—')}</td>
          <td class="num">{_esc(pts_disp)}</td>
          <td class="muted">{_esc(s.get('descriptor') or '—')}</td>
        </tr>
        """

    logo = (
        f'<img class="logo" src="{_esc(data["logoUrl"])}" alt="" />'
        if data.get("logoUrl")
        else '<div class="logo-fallback">A</div>'
    )
    stamp = (
        f'<img class="stamp" src="{_esc(data["stampUrl"])}" alt="" />'
        if data.get("stampUrl")
        else ""
    )

    photo = data.get("photoUrl")
    initials = _esc(data.get("studentInitials") or "?")
    avatar = (
        f'<img class="avatar-img" src="{_esc(photo)}" alt="" />'
        if photo
        else f'<div class="avatar-initials">{initials}</div>'
    )

    rank = "—"
    if data.get("position") and data.get("classSize"):
        rank = f"{data['position']} of {data['classSize']}"

    result = data.get("result_code") or ""
    result_label = {
        "1": "Certificate Eligible",
        "2": "Partial Pass",
        "6": "Incomplete",
    }.get(result, result or "—")
    result_class = {
        "1": "pill-success",
        "2": "pill-warn",
        "6": "pill-muted",
    }.get(result, "pill-muted")

    approved = ""
    if data.get("approvedAt"):
        when = str(data["approvedAt"])[:10]
        who = data.get("approvedByName") or "Head teacher"
        approved = f"Approved by {_esc(who)} · {_esc(when)}"
    else:
        approved = "Pending approval"

    exam_bits = " · ".join(
        p
        for p in [
            data.get("examName"),
            data.get("examTypeName"),
            data.get("termName"),
        ]
        if p
    )

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
  .brand h1 {{
    margin: 0;
    font-size: 20px;
    color: #1e3a5f;
    letter-spacing: -0.02em;
  }}
  .brand .eyebrow {{
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }}
  .logo {{ height: 58px; max-width: 140px; object-fit: contain; }}
  .logo-fallback {{
    width: 52px; height: 52px; border-radius: 14px;
    background: #1e3a5f; color: #fff; display: flex;
    align-items: center; justify-content: center;
    font-weight: 700; font-size: 18px;
  }}
  .identity {{
    display: flex; gap: 14px; align-items: center;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 14px; padding: 14px 16px; margin-bottom: 16px;
  }}
  .avatar, .avatar-img, .avatar-initials {{
    width: 64px; height: 64px; border-radius: 16px; flex-shrink: 0;
  }}
  .avatar-img {{ object-fit: cover; border: 2px solid #fff; }}
  .avatar-initials {{
    display: flex; align-items: center; justify-content: center;
    background: #dbeafe; color: #1e3a5f; font-weight: 700; font-size: 20px;
  }}
  .identity h2 {{ margin: 0; font-size: 16px; }}
  .meta {{ color: #64748b; margin-top: 4px; }}
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
  .card .value {{ font-size: 16px; font-weight: 700; color: #0f172a; }}
  .pill {{
    display: inline-block; padding: 4px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
  }}
  .pill-success {{ background: #dcfce7; color: #166534; }}
  .pill-warn {{ background: #fef3c7; color: #92400e; }}
  .pill-muted {{ background: #f1f5f9; color: #475569; }}
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
  .footer {{
    margin-top: 22px; display: flex; justify-content: space-between;
    align-items: flex-end; gap: 16px; padding-top: 12px;
    border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px;
  }}
  .stamp {{ height: 68px; opacity: 0.9; object-fit: contain; }}
</style></head>
<body>
  <div class="header">
    <div class="brand">
      <h1>{_esc(data.get('schoolName') or 'School')}</h1>
      <div class="eyebrow">A-Level examination report</div>
    </div>
    {logo}
  </div>

  <div class="identity">
    <div class="avatar">{avatar}</div>
    <div>
      <h2>{_esc(data.get('studentName'))}</h2>
      <div class="meta">{_esc(exam_bits)}</div>
      <div class="chips">
        <span class="chip">{_esc(data.get('learnerId') or '—')}</span>
        <span class="chip">{_esc(data.get('className') or '—')}</span>
        <span class="chip">{_esc(data.get('combinationName') or '—')}</span>
      </div>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="label">Total points</div>
      <div class="value">{_esc(data.get('total_points', 0))} <span style="font-size:12px;font-weight:500;color:#64748b">/ 20</span></div>
    </div>
    <div class="card">
      <div class="label">Principal passes</div>
      <div class="value">{_esc(data.get('principal_pass_count', 0))}</div>
    </div>
    <div class="card">
      <div class="label">Result</div>
      <div class="value"><span class="pill {result_class}">{_esc(result_label)}</span></div>
    </div>
    <div class="card">
      <div class="label">Class rank</div>
      <div class="value">{_esc(rank)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th style="text-align:center">Score</th>
        <th style="text-align:center">Grade</th>
        <th style="text-align:center">Pts</th>
        <th>Descriptor</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>

  <div class="comments">
    <h3>Class teacher comment</h3>
    <div class="box">{_esc(data.get('classTeacherComment') or '—')}</div>
    <h3>Head teacher comment</h3>
    <div class="box">{_esc(data.get('headTeacherComment') or '—')}</div>
  </div>

  <div class="footer">
    <div>{approved}</div>
    {stamp}
  </div>
</body></html>"""


async def generate_alevel_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    html_str = build_alevel_report_html(data)
    return await asyncio.to_thread(lambda: HTML(string=html_str).write_pdf())
