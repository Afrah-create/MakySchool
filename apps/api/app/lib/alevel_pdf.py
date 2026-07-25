"""A-Level report card PDF generation (WeasyPrint), mirroring fee receipts."""

from __future__ import annotations

from typing import Any


def build_alevel_report_html(data: dict[str, Any]) -> str:
    rows = ""
    for s in data.get("subjects") or []:
        rows += f"""
        <tr>
          <td>{s.get('subjectName') or ''}</td>
          <td style="text-align:center">{s.get('rawScore') if s.get('rawScore') is not None else '—'}</td>
          <td style="text-align:center;font-weight:600">{s.get('grade') or '—'}</td>
          <td style="text-align:center">{s.get('points') if s.get('points') is not None else '—'}</td>
          <td>{s.get('descriptor') or ''}</td>
        </tr>
        """

    logo = (
        f'<img src="{data["logoUrl"]}" alt="" style="height:64px;object-fit:contain;" />'
        if data.get("logoUrl")
        else ""
    )
    stamp = (
        f'<img src="{data["stampUrl"]}" alt="" style="height:72px;opacity:0.85;" />'
        if data.get("stampUrl")
        else ""
    )
    rank = ""
    if data.get("position") and data.get("classSize"):
        rank = f"{data['position']} of {data['classSize']}"

    result = data.get("result_code") or ""
    result_label = {"1": "Certificate Eligible", "2": "Partial Pass", "6": "Incomplete"}.get(
        result, result
    )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111; font-size: 12px; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }}
  h1 {{ margin: 0; font-size: 18px; color: #1e3a5f; }}
  .meta {{ color: #555; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
  th, td {{ border: 1px solid #ddd; padding: 6px 8px; }}
  th {{ background: #f3f6fa; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }}
  .totals {{ margin-top: 16px; display: flex; gap: 24px; }}
  .totals div {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }}
  .comments {{ margin-top: 20px; }}
  .comments h3 {{ font-size: 12px; margin: 0 0 6px; color: #1e3a5f; }}
  .box {{ border: 1px solid #ddd; min-height: 48px; padding: 8px; border-radius: 6px; margin-bottom: 12px; }}
  .footer {{ margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; }}
</style></head>
<body>
  <div class="header">
    <div>
      <h1>{data.get('schoolName') or 'School'}</h1>
      <div class="meta">A-Level Term Report · {data.get('termName') or ''}</div>
    </div>
    {logo}
  </div>

  <p><strong>{data.get('studentName') or ''}</strong>
     · {data.get('learnerId') or ''}
     · {data.get('className') or ''}
     · {data.get('combinationName') or ''}</p>

  <table>
    <thead>
      <tr>
        <th>Subject</th><th>Score</th><th>Grade</th><th>Points</th><th>Descriptor</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>

  <div class="totals">
    <div><strong>Total points</strong><br/>{data.get('total_points', 0)} / 20</div>
    <div><strong>Principal passes</strong><br/>{data.get('principal_pass_count', 0)}</div>
    <div><strong>Result</strong><br/>{result_label}</div>
    <div><strong>Class rank</strong><br/>{rank or '—'}</div>
  </div>

  <div class="comments">
    <h3>Class teacher comment</h3>
    <div class="box">{data.get('classTeacherComment') or ''}</div>
    <h3>Head teacher comment</h3>
    <div class="box">{data.get('headTeacherComment') or ''}</div>
  </div>

  <div class="footer">
    <div>
      {"Approved by " + (data.get('approvedByName') or '') + " on " + (data.get('approvedAt') or '')[:10]
        if data.get('approvedAt') else "Pending approval"}
    </div>
    {stamp}
  </div>
</body></html>"""


async def generate_alevel_report_pdf_bytes(data: dict[str, Any]) -> bytes:
    from weasyprint import HTML

    return HTML(string=build_alevel_report_html(data)).write_pdf()
