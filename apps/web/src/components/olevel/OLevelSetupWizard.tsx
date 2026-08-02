"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersOLevel, type CurriculumReportRules } from "@makyschool/shared";
import { olevelApi } from "@/lib/api/olevel";
import { useOLevelCurriculum, useOLevelCurriculumSubjects, useOLevelSubjects } from "@/hooks/useOLevel";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

const tabs = ["Grade scale", "Categories", "Selection rules", "Subjects", "Report rules"] as const;
type Tab = typeof tabs[number];
export function OLevelSetupWizard() {
  const { school } = useSchool(); const { toast } = useToast(); const offers = schoolOffersOLevel(school?.school_type);
  const { data: curriculum, refetch } = useOLevelCurriculum(offers); const { data: subjects = [] } = useOLevelSubjects(offers); const { data: assigned = [] } = useOLevelCurriculumSubjects(curriculum?.id, offers);
  const [tab, setTab] = useState<Tab>("Grade scale"); const [saving, setSaving] = useState(false);
  const [grades, setGrades] = useState<any[]>([]); const [categories, setCategories] = useState<any[]>([]); const [rules, setRules] = useState<any[]>([]); const [report, setReport] = useState<Partial<CurriculumReportRules>>({});
  useEffect(() => { if (curriculum) { setGrades(curriculum.gradeScale ?? []); setCategories(curriculum.assessmentCategories ?? []); setRules(curriculum.selectionRules ?? []); setReport(curriculum.reportRules ?? {}); } }, [curriculum]);
  if (!offers) return <DashboardPage embedded title="O-Level setup"><EmptyState title="O-Level not enabled" description="Not available for this school type." /></DashboardPage>;
  if (!curriculum) return <DashboardPage embedded title="O-Level setup"><EmptyState title="Set up O-Level first" description="Create the curriculum from the O-Level overview before editing its rules." /></DashboardPage>;
  async function save() { if (!curriculum) return; setSaving(true); try { if (tab === "Grade scale") await olevelApi.putGradeScale(curriculum.id, grades); if (tab === "Categories") await olevelApi.putCategories(curriculum.id, categories); if (tab === "Selection rules") await olevelApi.putSelectionRules(curriculum.id, rules); if (tab === "Report rules") await olevelApi.putReportRules(curriculum.id, report); await refetch(); toast.success(`${tab} saved.`); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save changes."); } finally { setSaving(false); } }
  const change = (items: any[], set: (v: any[]) => void, i: number, key: string, value: string | boolean) => set(items.map((x, n) => n === i ? { ...x, [key]: typeof x[key] === "number" ? Number(value) : value } : x));
  return <DashboardPage embedded maxWidth="7xl" eyebrow="O-Level" title="Curriculum setup" description="Configure assessment and report-card rules."><div className="space-y-5">
    <div className="flex flex-wrap gap-2">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm ${tab === t ? "bg-theme-accent text-white" : "bg-theme-raised text-theme-muted"}`}>{t}</button>)}</div>
    <div className="rounded-xl border border-theme bg-theme-surface p-5">
      {tab === "Grade scale" && <EditableTable rows={grades} fields={["grade", "label", "minPercent", "maxPercent", "points", "isPass"]} change={(i,k,v) => change(grades,setGrades,i,k,v)} />}
      {tab === "Categories" && <><p className="mb-3 text-sm text-theme-muted">Weights should total 100%.</p><EditableTable rows={categories} fields={["name", "code", "weightPercent", "isActive"]} change={(i,k,v) => change(categories,setCategories,i,k,v)} /></>}
      {tab === "Selection rules" && <><p className="mb-3 text-sm text-theme-muted">Configure one rule for S1–S2 and another for S3–S4.</p><EditableTable rows={rules} fields={["appliesToLevels", "minSubjects", "maxSubjects", "compulsoryCount", "optionalMin", "optionalMax", "optionalToCountInResult"]} change={(i,k,v) => change(rules,setRules,i,k,v)} /></>}
      {tab === "Subjects" && <div className="space-y-3"><p className="text-sm text-theme-muted">Assign catalogue subjects to the curriculum and choose their role.</p>{subjects.map(s => { const linked = assigned.find(a => a.subjectId === s.id); return <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-theme pt-3"><span><b>{s.name}</b> <span className="text-xs text-theme-muted">{s.code}</span></span>{linked ? <button className="text-sm text-red-500" onClick={async () => { await olevelApi.removeCurriculumSubject(curriculum.id, s.id); void refetch(); }}>Remove</button> : <button className="text-sm text-theme-accent" onClick={async () => { await olevelApi.assignCurriculumSubject(curriculum.id, { subjectId:s.id, subjectRole:"optional", appliesToLevels:["S1","S2","S3","S4"] }); void refetch(); }}>Assign optional</button>}</div>})}</div>}
      {tab === "Report rules" && <div className="grid gap-3 sm:grid-cols-2">{["showGrades","showPercentages","showPoints","showRemarks","showClassPosition","showSubjectPosition","showDivisionRanking","showResultCode","showTeacherComment","showHeadTeacherComment","showAttendance"].map(key => <label key={key} className="flex items-center gap-2 text-sm text-theme-primary"><input type="checkbox" checked={Boolean(report[key as keyof CurriculumReportRules])} onChange={e => setReport({ ...report, [key]: e.target.checked })}/>{key.replace(/^show/, "Show ")}</label>)}<label className="sm:col-span-2 text-sm">Report title<input className="ms-input mt-1 w-full" value={report.reportTitle ?? ""} onChange={e=>setReport({...report,reportTitle:e.target.value})}/></label></div>}
      {tab !== "Subjects" && <LoadingButton className="mt-5" loading={saving} onClick={() => void save()}>Save {tab}</LoadingButton>}
    </div></div></DashboardPage>;
}
function EditableTable({ rows, fields, change }: { rows:any[]; fields:string[]; change:(i:number,k:string,v:string|boolean)=>void }) { return <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{fields.map(f=><th key={f} className="px-2 py-2 text-left text-xs text-theme-muted">{f}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id ?? i} className="border-t border-theme">{fields.map(f=><td key={f} className="p-2">{typeof row[f] === "boolean" ? <input type="checkbox" checked={row[f]} onChange={e=>change(i,f,e.target.checked)}/> : <input className="ms-input min-w-20" value={Array.isArray(row[f]) ? row[f].join(", ") : row[f] ?? ""} onChange={e=>change(i,f,e.target.value)}/>}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="py-6 text-center text-sm text-theme-muted">No rules configured yet.</p>}</div>; }
