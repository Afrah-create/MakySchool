"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, CalendarRange } from "lucide-react";
import type { AcademicYearSummary, SchoolAnnualSummaryRow } from "@makyschool/shared/types";
import { can } from "@makyschool/shared/constants";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/providers/ToastProvider";
import { mutate } from "swr";
import { useSchool } from "@/providers/SchoolProvider";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-theme bg-theme-raised/40 px-4 py-3">
      <p className="text-xs text-theme-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-theme-primary">{value}</p>
    </div>
  );
}

export function HistoricalRecordsPage() {
  const { state } = useAuth();
  const { schoolSlug } = useSchool();
  const { toast } = useToast();
  const canActivate = state.user?.role ? can(state.user.role, "manageAcademicYear") : false;

  const {
    data: years,
    error: yearsError,
    isLoading: yearsLoading,
    mutate: mutateYears,
    isValidating: yearsValidating,
  } = useSchoolSWR<AcademicYearSummary[]>(
    "/schools/settings/academic-years?visibility=historical",
  );

  const {
    data: summaries,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSchoolSWR<SchoolAnnualSummaryRow[]>("/schools/analytics/annual-summary");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const selected = useMemo(() => {
    if (!years?.length) return null;
    const id = selectedId ?? years[0]?.id ?? null;
    return years.find((y) => y.id === id) ?? years[0] ?? null;
  }, [years, selectedId]);

  const summary = useMemo(
    () => summaries?.find((s) => s.academicYearId === selected?.id) ?? null,
    [summaries, selected],
  );

  async function activateSelected() {
    if (!selected || selected.isCurrent) return;
    setActivating(true);
    try {
      await apiClient(`/schools/settings/academic-years/${selected.id}/activate`, {
        method: "POST",
        body: {},
      });
      toast.success(`Switched working year to ${selected.year}.`);
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[1] === schoolSlug,
      );
      await mutateYears();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate year.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusBanner
        tone="info"
        message="Editing is disabled on this page. Activate a year only if you need to work in that year across the school."
      />

      <QueryState
        isLoading={yearsLoading && !years}
        isValidating={yearsValidating}
        error={yearsError}
        data={years}
        onRetry={() => void mutateYears()}
        empty={
          <EmptyState
            icon={Archive}
            title="No historical years yet"
            description="Warm and archived years appear here after more academic years accumulate, or when retention thresholds move years out of hot."
            action={
              <Link href="/dashboard/settings/data-retention" className="ms-btn-secondary text-sm">
                Configure retention
              </Link>
            }
          />
        }
        isEmpty={(rows) => !rows || rows.length === 0}
      >
        {(rows) => (
          <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
            <aside className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Years</p>
              <ul className="overflow-hidden rounded-xl border border-theme">
                {rows.map((y) => {
                  const active = y.id === selected?.id;
                  return (
                    <li key={y.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(y.id)}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "bg-theme-accent-muted font-medium text-theme-accent"
                            : "bg-theme-surface text-theme-primary hover:bg-theme-raised"
                        }`}
                      >
                        <span>{y.year}</span>
                        <span className="capitalize text-xs text-theme-muted">{y.visibility}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="space-y-4 rounded-2xl border border-theme bg-theme-surface p-5 shadow-theme-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                    <CalendarRange className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-theme-primary">
                      Academic year {selected?.year}
                    </h2>
                    <p className="text-sm capitalize text-theme-muted">
                      {selected?.visibility} · {selected?.status ?? "unknown"} status
                      {selected?.isCurrent ? " · currently active" : ""}
                    </p>
                  </div>
                </div>
                {canActivate && selected && !selected.isCurrent ? (
                  <LoadingButton
                    loading={activating}
                    className="ms-btn-secondary rounded-lg px-3 py-1.5 text-sm"
                    onClick={() => void activateSelected()}
                  >
                    Work in this year
                  </LoadingButton>
                ) : null}
              </div>

              {summaryLoading && !summaries ? (
                <p className="text-sm text-theme-muted">Loading year summary…</p>
              ) : summaryError ? (
                <div className="space-y-2">
                  <p className="text-sm text-theme-danger">Could not load analytics summary.</p>
                  <LoadingButton variant="ghost" onClick={() => void mutateSummary()}>
                    Retry
                  </LoadingButton>
                </div>
              ) : summary ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Enrolled students" value={String(summary.enrolledStudentCount)} />
                  <Metric
                    label="Fee collection"
                    value={`${summary.feeCollectionRate.toFixed(1)}%`}
                  />
                  <Metric
                    label="Academic average"
                    value={`${summary.avgAcademicScore.toFixed(1)}%`}
                  />
                  <Metric
                    label="Attendance rate"
                    value={`${summary.avgAttendanceRate.toFixed(1)}%`}
                  />
                  <Metric
                    label="Fees paid"
                    value={summary.feeAmountPaid.toLocaleString()}
                  />
                  <Metric
                    label="Fees owed"
                    value={summary.feeAmountOwed.toLocaleString()}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No summary for this year"
                  description="Run analytics refresh from the dashboard after marks, fees, or attendance exist for this year."
                />
              )}

              <p className="text-xs text-theme-muted">
                For class lists, results, and fee ledgers, activate the year (admin) or open the
                corresponding module while that year is current. This page stays read-only.
              </p>
            </section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
