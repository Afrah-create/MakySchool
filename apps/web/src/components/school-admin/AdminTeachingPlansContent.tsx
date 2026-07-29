"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import type { TeachingPlan } from "@makyschool/shared";
import { useToast } from "@/providers/ToastProvider";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  useResourceTerms,
  useTeachingPlanCompliance,
  useTeachingPlans,
} from "@/hooks/useResources";
import { resourcesApi } from "@/lib/api/resources";
import type { ClassWithDetails } from "@makyschool/shared/types";
import type { SubjectWithDetails } from "@makyschool/shared/types";
import type { TeacherListItem, TeachersListResponse } from "@/lib/teachers/types";
import { formatBytes, formatShortDate } from "@/lib/resources/format";

export function AdminTeachingPlansContent() {
  const { toast } = useToast();
  const { data: currentTerm } = useCurrentTerm();
  const { data: terms = [] } = useResourceTerms();
  const { data: classes = [] } = useApiSWR<ClassWithDetails[]>("/schools/classes");
  const { data: subjects = [] } = useApiSWR<SubjectWithDetails[]>("/schools/subjects");
  const { data: teachersData } = useApiSWR<TeachersListResponse>(
    "/schools/teachers?limit=200",
  );
  const teachers: TeacherListItem[] = teachersData?.teachers ?? [];

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [termId, setTermId] = useState("");

  useEffect(() => {
    if (!termId && currentTerm?.id) setTermId(currentTerm.id);
  }, [currentTerm?.id, termId]);

  const filters = useMemo(
    () => ({
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      teacherId: teacherId || undefined,
      termId: termId || undefined,
    }),
    [classId, subjectId, teacherId, termId],
  );

  const { data: plans = [], isPending, isError, refetch } = useTeachingPlans(filters);
  const { data: compliance } = useTeachingPlanCompliance(termId, !!termId);

  async function handleDownload(plan: TeachingPlan) {
    try {
      const { url } = await resourcesApi.downloadTeachingPlan(plan.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Academic"
      title="Teaching plans"
      description="View and download teaching plans submitted by teachers."
    >
      <div className="space-y-6">
        {compliance ? (
          <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
            <p className="text-sm font-semibold text-theme-primary">
              {compliance.uploadedCount} of {compliance.totalTeachers} teachers have
              uploaded a plan for {compliance.termName}
            </p>
            {compliance.missingTeachers.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-theme-muted">
                  {compliance.missingTeachers.length} missing — show list
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-theme-muted">
                  {compliance.missingTeachers.map((t) => (
                    <li key={t.id}>{t.fullName}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-2 text-sm text-theme-muted">
                All assigned teachers have uploaded for this term.
              </p>
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <FilterSelect
            label="Class"
            value={classId}
            onChange={setClassId}
            options={classes.map((c) => ({
              id: c.id,
              name: c.stream ? `${c.level}${c.stream}` : c.level,
            }))}
          />
          <FilterSelect
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={subjects.map((s) => ({ id: s.id, name: s.name }))}
          />
          <FilterSelect
            label="Teacher"
            value={teacherId}
            onChange={setTeacherId}
            options={teachers.map((t) => ({ id: t.id, name: t.full_name }))}
          />
          <FilterSelect
            label="Term"
            value={termId}
            onChange={setTermId}
            allLabel="All terms"
            options={terms.map((t) => ({
              id: t.id,
              name: t.isCurrent ? `${t.name} (current)` : t.name,
            }))}
          />
        </div>

        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={FileText}
            title="Could not load teaching plans"
            description="Please try again."
            action={
              <button type="button" className="ms-btn-secondary" onClick={() => void refetch()}>
                Retry
              </button>
            }
          />
        ) : plans.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No teaching plans found"
            description="Adjust filters or wait for teachers to upload their plans."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-theme md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-theme-raised/50 text-[11px] uppercase tracking-wider text-theme-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Teacher</th>
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Term</th>
                    <th className="px-4 py-3 font-semibold">Size</th>
                    <th className="px-4 py-3 font-semibold">Uploaded</th>
                    <th className="px-4 py-3 font-semibold"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="bg-theme-surface">
                      <td className="px-4 py-3 text-theme-primary">{plan.teacherName}</td>
                      <td className="px-4 py-3 font-medium text-theme-primary">{plan.title}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.subjectName}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.className}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.termName}</td>
                      <td className="px-4 py-3 tabular-nums text-theme-muted">
                        {formatBytes(plan.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-theme-muted">
                        {formatShortDate(plan.uploadedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="ms-btn-secondary inline-flex items-center gap-1.5 text-xs"
                          onClick={() => void handleDownload(plan)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {plans.map((plan) => (
                <article
                  key={plan.id}
                  className="rounded-xl border border-theme bg-theme-surface p-4"
                >
                  <h3 className="font-semibold text-theme-primary">{plan.title}</h3>
                  <p className="mt-1 text-sm text-theme-muted">{plan.teacherName}</p>
                  <p className="mt-1 text-xs text-theme-faint">
                    {plan.subjectName} · {plan.className} · {plan.termName}
                  </p>
                  <button
                    type="button"
                    className="ms-btn-secondary mt-3 text-xs"
                    onClick={() => void handleDownload(plan)}
                  >
                    Download
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardPage>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = `All ${label.toLowerCase()}s`,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
  allLabel?: string;
}) {
  return (
    <label className="block sm:min-w-[10rem] sm:flex-1">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
        {label}
      </span>
      <select
        className="ms-input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
