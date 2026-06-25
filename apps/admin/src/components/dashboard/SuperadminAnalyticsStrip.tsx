"use client";

import type { SuperadminAnalytics } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonStatGrid } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";

function formatUgx(amount: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SuperadminAnalyticsStrip() {
  const { data, error, isLoading, mutate } = useApiSWR<SuperadminAnalytics>(
    "/superadmin/analytics",
  );

  return (
    <QueryState
      isLoading={isLoading && !data}
      error={error}
      data={data}
      onRetry={() => void mutate()}
      loading={<SkeletonStatGrid count={4} layout="strip" />}
      isEmpty={() => false}
    >
      {(analytics) => (
        <div className="mb-6 flex gap-4 overflow-x-auto pb-1">
          <div className="ms-card w-52 shrink-0 p-5">
            <p className="text-xs text-theme-muted">Total schools</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-theme-primary">
              {analytics.schools.total}
            </p>
          </div>
          <div className="ms-card w-52 shrink-0 p-5">
            <p className="text-xs text-theme-muted">Active schools</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-theme-primary">
              {analytics.schools.active}
            </p>
          </div>
          <div className="ms-card w-52 shrink-0 p-5">
            <p className="text-xs text-theme-muted">In setup</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-theme-primary">
              {analytics.schools.setup}
            </p>
          </div>
          <div className="ms-card w-56 shrink-0 p-5">
            <p className="text-xs text-theme-muted">Revenue {analytics.revenue.year}</p>
            <p className="mt-3 text-lg font-semibold tabular-nums text-theme-primary">
              {formatUgx(analytics.revenue.totalThisYear)}
            </p>
          </div>
        </div>
      )}
    </QueryState>
  );
}
