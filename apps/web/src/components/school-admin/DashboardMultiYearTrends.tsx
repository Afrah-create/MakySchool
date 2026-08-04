"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SchoolAnnualSummaryRow } from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonStatGrid } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@makyschool/shared/constants";
import { useToast } from "@/providers/ToastProvider";
import { useState } from "react";

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
        <p className="text-xs text-theme-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function DashboardMultiYearTrends() {
  const { state } = useAuth();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const canRefresh = state.user?.role
    ? can(state.user.role, "manageAcademicYear")
    : false;

  const { data, error, isLoading, mutate, isValidating } = useSchoolSWR<
    SchoolAnnualSummaryRow[]
  >("/schools/analytics/annual-summary");

  const chartData = useMemo(
    () =>
      (data ?? []).map((row) => ({
        year: String(row.year),
        enrollment: row.enrolledStudentCount,
        fees: Number(row.feeCollectionRate.toFixed(1)),
        performance: Number(row.avgAcademicScore.toFixed(1)),
        attendance: Number(row.avgAttendanceRate.toFixed(1)),
      })),
    [data],
  );

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await apiClient<{ elapsedMs: number }>("/schools/analytics/refresh", {
        method: "POST",
        body: {},
      });
      toast.success(`Analytics refreshed in ${res.data.elapsedMs}ms.`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-theme-primary">Multi-year trends</h2>
          <p className="mt-0.5 text-xs text-theme-muted">
            Enrollment, fees, academics, and attendance across academic years
          </p>
        </div>
        {canRefresh ? (
          <LoadingButton
            variant="ghost"
            loading={refreshing}
            className="rounded-lg px-3 py-1.5 text-xs"
            onClick={() => void refresh()}
          >
            Refresh cache
          </LoadingButton>
        ) : null}
      </div>

      <QueryState
        isLoading={isLoading && !data}
        isValidating={isValidating}
        error={error}
        data={data}
        onRetry={() => void mutate()}
        loading={<SkeletonStatGrid count={4} layout="strip" />}
        empty={
          <EmptyState
            title="No trend data yet"
            description="Trends appear after academic years accumulate results, fees, and attendance."
          />
        }
        isEmpty={(rows) => !rows || rows.length === 0}
      >
        {() => (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Enrollment" subtitle="Students with class history per year">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="enrollment" name="Students" fill="var(--color-accent, #0d9488)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Fee collection rate" subtitle="Paid vs owed (%)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fees"
                    name="Collection %"
                    stroke="var(--color-success, #10b981)"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Academic performance" subtitle="Average score across results">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="performance"
                    name="Avg score"
                    stroke="var(--color-accent, #0d9488)"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Attendance rate" subtitle="Present + late over marked records">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="attendance"
                    name="Attendance %"
                    stroke="var(--color-warning, #f59e0b)"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </QueryState>
    </section>
  );
}
