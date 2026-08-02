"""O-Level report PDF rendering, controlled entirely by report-rule flags."""
from __future__ import annotations
import asyncio, html
from typing import Any
def _esc(v:Any)->str:return html.escape("" if v is None else str(v))
def build_olevel_report_html(data:dict[str,Any])->str:
 rules=data.get("reportRules") or {}; subjects=data.get("subjectResults") or []
 headers=["Subject"]+([ "%"] if rules.get("showPercentages",True) else [])+(["Grade"] if rules.get("showGrades",True) else [])+(["Points"] if rules.get("showPoints",True) else [])
 rows="".join("<tr><td>"+_esc(x.get("subjectName"))+"</td>"+((" <td>"+_esc(x.get("weightedScore"))+"</td>") if rules.get("showPercentages",True) else "")+(("<td>"+_esc(x.get("grade"))+"</td>") if rules.get("showGrades",True) else "")+(("<td>"+_esc(x.get("points"))+"</td>") if rules.get("showPoints",True) else "")+"</tr>" for x in subjects)
 return f"""<html><style>@page{{size:A4;margin:15mm}}body{{font-family:Arial;color:#172554}}table{{width:100%;border-collapse:collapse}}td,th{{padding:8px;border:1px solid #cbd5e1}}th{{background:#1e3a5f;color:white}}</style><body><h1>{_esc(data.get('schoolName'))}</h1><h2>{_esc(rules.get('reportTitle','PROGRESS REPORT'))}</h2><p>{_esc(data.get('studentName'))} · {_esc(data.get('className'))}</p><table><tr>{''.join('<th>'+_esc(x)+'</th>' for x in headers)}</tr>{rows}</table>{'<p>Class teacher: '+_esc(data.get('classTeacherComment'))+'</p>' if rules.get('showTeacherComment',True) else ''}{'<p>Head teacher: '+_esc(data.get('headTeacherComment'))+'</p>' if rules.get('showHeadTeacherComment',True) else ''}<footer>{_esc(rules.get('customFooterText'))}</footer></body></html>"""
async def generate_olevel_report_pdf_bytes(data:dict[str,Any])->bytes:
 from weasyprint import HTML
 return await asyncio.to_thread(lambda:HTML(string=build_olevel_report_html(data)).write_pdf())
