"use client";

import type { AnalyticsOverview } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonStatGrid } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";

function formatUgx(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
}

function submissionSummary(byStatus: Record<string, number>) {
  const submitted = byStatus.submitted ?? 0;
  const pending = (byStatus.pending ?? 0) + (byStatus.draft ?? 0);
  return `${submitted} submitted · ${pending} pending`;
}

export function DashboardAnalyticsStrip() {
  const { data, error, isLoading, mutate, isValidating } = useSchoolSWR<AnalyticsOverview>(
    "/schools/analytics/overview",
  );

  return (
    <QueryState
      isLoading={isLoading && !data}
      isValidating={isValidating}
      error={error}
      data={data}
      onRetry={() => void mutate()}
      loading={<SkeletonStatGrid count={3} layout="strip" />}
      isEmpty={() => false}
    >
      {(overview) => (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-theme-primary">Analytics</h2>
            <p className="text-xs text-theme-muted">School performance indicators for the current term</p>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-1">
            <div className="ms-card w-56 shrink-0 p-5">
              <p className="text-xs text-theme-muted">Fee collection rate</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-theme-primary">
                {overview.feeCollectionRate.ratePercent}%
              </p>
              <p className="mt-1 text-xs text-theme-muted">
                {formatUgx(overview.feeCollectionRate.amountPaid)} collected of{" "}
                {formatUgx(overview.feeCollectionRate.amountOwed)}
              </p>
            </div>

            <div className="ms-card w-56 shrink-0 p-5">
              <p className="text-xs text-theme-muted">Marks submission</p>
              <p className="mt-3 text-sm font-medium text-theme-primary">
                {submissionSummary(overview.teacherMarksSubmission.byStatus)}
              </p>
            </div>

            <div className="ms-card w-56 shrink-0 p-5">
              <p className="text-xs text-theme-muted">Students & classes</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-theme-primary">
                {overview.studentClassCounts.students}
              </p>
              <p className="mt-1 text-xs text-theme-muted">
                across {overview.studentClassCounts.classes} classes
              </p>
            </div>

            <StubCard
              title="Best students"
              reason={overview.bestStudents.reason}
            />
            <StubCard
              title="Weak subjects"
              reason={overview.weakSubjects.reason}
            />
            <StubCard
              title="Attendance trends"
              reason={overview.attendanceTrends.reason}
            />
            <StubCard
              title="Competency achievement"
              reason={overview.competencyAchievement.reason}
            />
          </div>
        </div>
      )}
    </QueryState>
  );
}

function StubCard({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="ms-card w-56 shrink-0 border-dashed p-5 opacity-70">
      <p className="text-xs text-theme-muted">{title}</p>
      <p className="mt-3 text-sm font-medium text-theme-primary">Coming soon</p>
      <p className="mt-1 text-xs text-theme-muted">{reason}</p>
    </div>
  );
}
