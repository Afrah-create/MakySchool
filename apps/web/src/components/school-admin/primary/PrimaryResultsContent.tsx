"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses, usePrimaryClassResults } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";

const GRADE_BADGE: Record<string, string> = {
  D: "badge-success",
  C: "badge-info",
  P: "badge-warning",
  F: "badge-danger",
};

export function PrimaryResultsContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const [classId, setClassId] = useState("");
  const [rankOpen, setRankOpen] = useState(false);
  const [ranking, setRanking] = useState(false);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data, isPending, refetch } = usePrimaryClassResults(
    classId,
    term?.id ?? "",
    offers && !!classId && !!term?.id,
  );

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary results">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function recalc() {
    if (!classId || !term?.id) return;
    setRanking(true);
    try {
      await primaryApi.refreshPositions(classId, term.id);
      toast.success("Class positions recalculated.");
      setRankOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recalculation failed.");
    } finally {
      setRanking(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Results"
      description="Class term results, grades, and positions."
      actions={
        <button type="button" className="ms-btn-secondary" onClick={() => setRankOpen(true)}>
          Recalculate rankings
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block max-w-xs">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
            Class
          </span>
          <select
            className="ms-input w-full"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {!term?.id ? (
          <EmptyState title="No current term" description="Set the current academic term first." />
        ) : isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : !data?.students.length ? (
          <EmptyState
            title="No results yet"
            description="Enter and save marks to generate computed results."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Learner ID</th>
                  {data.isLowerPrimary ? (
                    <th className="px-3 py-2">Avg level</th>
                  ) : (
                    <>
                      <th className="px-3 py-2">Avg%</th>
                      <th className="px-3 py-2">Grade</th>
                    </>
                  )}
                  <th className="px-3 py-2"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {data.students.map((s) => (
                  <tr key={s.studentId} className="bg-theme-surface">
                    <td className="px-3 py-2 tabular-nums text-theme-muted">
                      {s.classPosition ?? "—"}
                      {s.totalStudents ? `/${s.totalStudents}` : ""}
                    </td>
                    <td className="px-3 py-2 font-medium text-theme-primary">{s.studentName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-theme-muted">
                      {s.learnerId ?? "—"}
                    </td>
                    {data.isLowerPrimary ? (
                      <td className="px-3 py-2 tabular-nums">{s.averageLevel ?? "—"}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 tabular-nums">{s.averagePercent ?? "—"}</td>
                        <td className="px-3 py-2">
                          {s.overallGrade ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                GRADE_BADGE[s.overallGrade] ?? ""
                              }`}
                            >
                              {s.overallGrade}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/primary/results/${s.studentId}?termId=${term.id}`}
                        className="text-xs font-medium text-theme-accent hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={rankOpen}
        title="Recalculate class rankings?"
        description="Positions will be recomputed from current averages. Tied averages share a rank."
        confirmLabel="Recalculate"
        loading={ranking}
        onCancel={() => setRankOpen(false)}
        onConfirm={() => void recalc()}
      />
    </DashboardPage>
  );
}
