"use client";

import Link from "next/link";
import type {
  AnalyticsOverview,
  BestStudentsMetric,
  CompetencyAchievementMetric,
  WeakSubjectsMetric,
} from "@makyschool/shared/types";
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
  const total = submitted + pending;
  if (total === 0) return { value: "—", hint: "No submissions yet" };
  return {
    value: `${submitted}/${total}`,
    hint: `${pending} still pending`,
  };
}

function isBestStudents(
  value: AnalyticsOverview["bestStudents"],
): value is BestStudentsMetric {
  return value.available === true;
}

function isWeakSubjects(
  value: AnalyticsOverview["weakSubjects"],
): value is WeakSubjectsMetric {
  return value.available === true;
}

function isCompetency(
  value: AnalyticsOverview["competencyAchievement"],
): value is CompetencyAchievementMetric {
  return value.available === true;
}

export function DashboardAnalyticsStrip() {
  const { data, error, isLoading, mutate, isValidating } =
    useSchoolSWR<AnalyticsOverview>("/schools/analytics/overview");

  return (
    <QueryState
      isLoading={isLoading && !data}
      isValidating={isValidating}
      error={error}
      data={data}
      onRetry={() => void mutate()}
      loading={<SkeletonStatGrid count={4} layout="strip" />}
      isEmpty={() => false}
    >
      {(overview) => {
        const best = isBestStudents(overview.bestStudents)
          ? overview.bestStudents
          : null;
        const weak = isWeakSubjects(overview.weakSubjects)
          ? overview.weakSubjects
          : null;
        const competency = isCompetency(overview.competencyAchievement)
          ? overview.competencyAchievement
          : null;
        const attendance =
          overview.attendanceTrends.available === true
            ? overview.attendanceTrends
            : null;
        const marks = submissionSummary(
          overview.teacherMarksSubmission.byStatus,
        );

        return (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-theme-primary">
                Term performance
              </h2>
              <p className="mt-0.5 text-xs text-theme-muted">
                Fees, marks, attendance, and assessment for the current term
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                title="Fee collection"
                value={`${overview.feeCollectionRate.ratePercent}%`}
                hint={`${formatUgx(overview.feeCollectionRate.amountPaid)} collected`}
                href="/dashboard/fees"
              />
              <MetricCard
                title="Marks submitted"
                value={marks.value}
                hint={marks.hint}
                href="/dashboard/teachers"
              />
              <MetricCard
                title="Attendance"
                value={
                  attendance ? `${attendance.averageAttendanceRate}%` : "—"
                }
                hint={
                  attendance
                    ? `${attendance.totalAbsent} absences · ${attendance.schoolDays} days`
                    : "No attendance data"
                }
                href="/dashboard/attendance"
              />
              <MetricCard
                title="Active learners"
                value={overview.studentClassCounts.students}
                hint={`${overview.studentClassCounts.classes} classes`}
                href="/dashboard/students"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ListCard
                title="Top performers"
                empty="Results appear once exams or sittings are graded."
                href="/dashboard/primary/results"
                items={(best?.items ?? []).map((item) => ({
                  key: item.studentId,
                  primary: item.fullName,
                  secondary: item.className,
                  meta: item.scoreLabel,
                }))}
              />
              <ListCard
                title="Subjects needing support"
                empty="Subject averages appear after marks are calculated."
                href="/dashboard/subjects"
                items={(weak?.items ?? []).map((item) => ({
                  key: item.subjectId,
                  primary: item.subjectName,
                  secondary: `${item.sampleSize} marks`,
                  meta: `${item.averagePercent}%`,
                }))}
              />
              <div className="md:col-span-2 xl:col-span-1">
                <CompetencyCard competency={competency} />
              </div>
            </div>
          </section>
        );
      }}
    </QueryState>
  );
}

function MetricCard({
  title,
  value,
  hint,
  href,
}: {
  title: string;
  value: string | number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="ms-card group flex min-h-[7rem] flex-col justify-between p-4 transition hover:border-accent-soft"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
        {title}
      </p>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-theme-primary group-hover:text-theme-accent">
          {value}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-theme-muted">
          {hint}
        </p>
      </div>
    </Link>
  );
}

function ListCard({
  title,
  empty,
  href,
  items,
}: {
  title: string;
  empty: string;
  href: string;
  items: Array<{
    key: string;
    primary: string;
    secondary: string;
    meta: string;
  }>;
}) {
  return (
    <div className="ms-card flex h-full min-h-[14rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-theme px-4 py-3">
        <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
        <Link
          href={href}
          className="shrink-0 text-xs font-medium text-theme-accent hover:underline"
        >
          View
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="flex flex-1 items-center px-4 py-5 text-sm text-theme-muted">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-theme-raised text-[11px] font-semibold tabular-nums text-theme-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-theme-primary">
                  {item.primary}
                </p>
                <p className="truncate text-xs text-theme-muted">
                  {item.secondary}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-theme-secondary">
                {item.meta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompetencyCard({
  competency,
}: {
  competency: CompetencyAchievementMetric | null;
}) {
  return (
    <div className="ms-card flex h-full min-h-[14rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-theme px-4 py-3">
        <h3 className="text-sm font-semibold text-theme-primary">
          Lower primary competency
        </h3>
        <Link
          href="/dashboard/primary/sittings"
          className="shrink-0 text-xs font-medium text-theme-accent hover:underline"
        >
          Sittings
        </Link>
      </div>
      {!competency || competency.assessedCells === 0 ? (
        <p className="flex flex-1 items-center px-4 py-5 text-sm text-theme-muted">
          Thematic levels appear once P1–P3 sittings are assessed.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-theme-primary">
              {competency.averageLevel.toFixed(1)}
              <span className="ml-2 text-sm font-medium text-theme-muted">
                {competency.averageLabel}
              </span>
            </p>
            <p className="mt-1 text-xs text-theme-muted">
              Average level · {competency.assessedCells} cells assessed
            </p>
          </div>
          <ul className="space-y-2">
            {competency.byStrand.slice(0, 4).map((strand) => (
              <li key={strand.strand} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-theme-secondary">
                  {strand.strand}
                </span>
                <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-theme-raised sm:w-20">
                  <div
                    className="h-full rounded-full bg-theme-accent"
                    style={{
                      width: `${Math.min(100, (strand.averageLevel / 4) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-theme-muted">
                  {strand.averageLevel.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
