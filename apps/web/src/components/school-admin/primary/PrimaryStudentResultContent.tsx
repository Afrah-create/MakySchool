"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { primaryApi } from "@/lib/api/primary";
import { useQuery } from "@tanstack/react-query";

type ResultPayload = {
  student?: {
    fullName?: string;
    learnerId?: string | null;
    className?: string | null;
    classId?: string | null;
  };
  termName?: string;
  isLowerPrimary?: boolean;
  totals?: {
    averagePercent?: number | null;
    overallGrade?: string | null;
    classPosition?: number | null;
    totalStudents?: number | null;
  } | null;
  thematicResults?: Array<{
    theme: string;
    strands: Array<{ strand: string; level: number; label?: string | null }>;
  }>;
  subjectResults?: Array<{
    subjectName: string;
    subjectCode: string;
    caPercentage: number | null;
    examPercentage: number | null;
    finalPercent: number | null;
    grade: string | null;
    gradeLabel: string | null;
  }>;
  classTeacherComment?: string | null;
  headTeacherComment?: string | null;
};

export function PrimaryStudentResultContent({ studentId }: { studentId: string }) {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const search = useSearchParams();
  const { data: term } = useCurrentTerm();
  const termId = search.get("termId") || term?.id || "";
  const [busy, setBusy] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["primary", "student-result", studentId, termId],
    queryFn: () => primaryApi.studentResult(studentId, termId) as Promise<ResultPayload>,
    enabled: offers && !!studentId && !!termId,
  });

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="5xl" title="Student result">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function downloadPdf() {
    const classId = data?.student?.classId;
    if (!classId || !termId) {
      toast.error("Missing class or term for PDF generation.");
      return;
    }
    setBusy(true);
    try {
      const result = await primaryApi.generateReportCards({
        classId,
        termId,
        studentId,
      });
      toast.success(`Downloaded ${result.filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title={data?.student?.fullName || "Student result"}
      description="Term report detail"
      actions={
        <div className="flex flex-wrap gap-2">
          <LoadingButton
            loading={busy}
            onClick={() => void downloadPdf()}
            className="inline-flex items-center gap-2 text-sm"
          >
            <Download className="h-4 w-4" />
            PDF
          </LoadingButton>
          <Link href="/dashboard/primary/results" className="ms-btn-secondary text-sm">
            Back
          </Link>
        </div>
      }
    >
      {!termId ? (
        <EmptyState title="Term required" description="Open this page from class results or set a current term." />
      ) : isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <EmptyState
          title="Could not load"
          description={error instanceof Error ? error.message : "Try again."}
        />
      ) : data ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-theme bg-theme-surface p-4 text-sm">
            <p className="font-medium text-theme-primary">{data.student?.fullName}</p>
            <p className="text-theme-muted">
              {data.student?.learnerId || "—"} · {data.student?.className || "—"} ·{" "}
              {data.termName || ""}
            </p>
            {data.totals ? (
              <p className="mt-2 text-theme-muted">
                Avg {data.totals.averagePercent ?? "—"}% · {data.totals.overallGrade ?? "—"}
                {data.totals.classPosition && data.totals.totalStudents
                  ? ` · Pos ${data.totals.classPosition}/${data.totals.totalStudents}`
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
                    <th className="px-3 py-2 text-left">CA %</th>
                    <th className="px-3 py-2 text-left">Exam %</th>
                    <th className="px-3 py-2 text-left">Final %</th>
                    <th className="px-3 py-2 text-left">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {(data.subjectResults ?? []).map((s) => (
                    <tr key={s.subjectCode}>
                      <td className="px-3 py-2 font-medium">{s.subjectName}</td>
                      <td className="px-3 py-2 tabular-nums">{s.caPercentage ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{s.examPercentage ?? "—"}</td>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-theme p-3">
              <p className="text-[11px] uppercase text-theme-muted">Class teacher</p>
              <p className="mt-1 text-sm">{data.classTeacherComment || "—"}</p>
            </div>
            <div className="rounded-xl border border-theme p-3">
              <p className="text-[11px] uppercase text-theme-muted">Head teacher</p>
              <p className="mt-1 text-sm">{data.headTeacherComment || "—"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPage>
  );
}
