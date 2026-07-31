"use client";

import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { primaryApi } from "@/lib/api/primary";
import { useQuery } from "@tanstack/react-query";

type StudentResultPayload = {
  isLowerPrimary?: boolean;
  termName?: string;
  academicYear?: number;
  subjectResults?: Array<{
    subjectName: string;
    subjectCode: string;
    finalPercent: number | null;
    grade: string | null;
    gradeLabel: string | null;
  }>;
  thematicResults?: Array<{
    theme: string;
    strands: Array<{ strand: string; level: number; label?: string | null }>;
  }>;
  totals?: {
    averagePercent: number | null;
    overallGrade: string | null;
    overallGradeLabel: string | null;
    classPosition: number | null;
    totalStudents: number | null;
  } | null;
  classTeacherComment?: string | null;
  headTeacherComment?: string | null;
};

export function StudentPrimaryResultsPanel({
  studentId,
  classLevel,
}: {
  studentId: string;
  classLevel?: string | null;
}) {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { data: term } = useCurrentTerm();
  const isPrimaryLevel = !!classLevel && /^P[1-7]$/.test(classLevel);

  const { data, isPending, error } = useQuery({
    queryKey: ["primary", "student-result", studentId, term?.id],
    queryFn: () =>
      primaryApi.studentResult(studentId, term!.id!) as Promise<StudentResultPayload>,
    enabled: offers && isPrimaryLevel && !!term?.id,
  });

  if (!offers || !isPrimaryLevel) {
    return (
      <EmptyState
        title="No primary results"
        description="Primary term results appear for learners in P1–P7 when the school offers primary."
      />
    );
  }

  if (!term?.id) {
    return (
      <EmptyState
        title="No current term"
        description="Set a current term to view this learner’s primary results."
      />
    );
  }

  if (isPending) return <Skeleton className="h-48 w-full" />;
  if (error) {
    return (
      <EmptyState
        title="Could not load results"
        description={error instanceof Error ? error.message : "Try again later."}
      />
    );
  }

  if (!data) {
    return <EmptyState title="No results yet" description="Marks have not been entered for this term." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-theme-primary">
          {data.termName}
          {data.academicYear ? ` · ${data.academicYear}` : ""}
        </p>
        {data.totals ? (
          <p className="text-sm text-theme-muted">
            Avg {data.totals.averagePercent ?? "—"}% · {data.totals.overallGrade ?? "—"}
            {data.totals.classPosition && data.totals.totalStudents
              ? ` · ${data.totals.classPosition}/${data.totals.totalStudents}`
              : ""}
          </p>
        ) : null}
      </div>

      {data.isLowerPrimary ? (
        <div className="overflow-x-auto rounded-xl border border-theme">
          <table className="min-w-full text-sm">
            <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
              <tr>
                <th className="px-3 py-2 text-left">Theme</th>
                <th className="px-3 py-2 text-left">Strand</th>
                <th className="px-3 py-2 text-left">Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {(data.thematicResults ?? []).flatMap((t) =>
                t.strands.map((s) => (
                  <tr key={`${t.theme}-${s.strand}`}>
                    <td className="px-3 py-2">{t.theme}</td>
                    <td className="px-3 py-2">{s.strand}</td>
                    <td className="px-3 py-2">
                      L{s.level}
                      {s.label ? ` · ${s.label}` : ""}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-theme">
          <table className="min-w-full text-sm">
            <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
              <tr>
                <th className="px-3 py-2 text-left">Subject</th>
                <th className="px-3 py-2 text-left">Final %</th>
                <th className="px-3 py-2 text-left">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {(data.subjectResults ?? []).map((s) => (
                <tr key={s.subjectCode}>
                  <td className="px-3 py-2 font-medium">{s.subjectName}</td>
                  <td className="px-3 py-2 tabular-nums">{s.finalPercent ?? "—"}</td>
                  <td className="px-3 py-2">
                    {s.grade ?? "—"}
                    {s.gradeLabel ? ` · ${s.gradeLabel}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data.classTeacherComment || data.headTeacherComment) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-theme p-3">
            <p className="text-[11px] uppercase text-theme-muted">Class teacher</p>
            <p className="mt-1 text-sm text-theme-primary">
              {data.classTeacherComment || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-theme p-3">
            <p className="text-[11px] uppercase text-theme-muted">Head teacher</p>
            <p className="mt-1 text-sm text-theme-primary">
              {data.headTeacherComment || "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
