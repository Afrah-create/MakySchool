"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { theme } from "@/lib/theme";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function DashboardStats() {
  const { schoolSlug } = useTenantSchool();

  const { data: classes, isLoading: loadingClasses } = useSWR(
    schoolSlug ? ["/schools/classes", schoolSlug] : null,
    ([path, slug]) => apiClient<unknown[]>(path, { schoolSlug: slug }).then((r) => r.data),
  );

  const { data: subjects, isLoading: loadingSubjects } = useSWR(
    schoolSlug ? ["/schools/subjects", schoolSlug] : null,
    ([path, slug]) => apiClient<unknown[]>(path, { schoolSlug: slug }).then((r) => r.data),
  );

  if (loadingClasses || loadingSubjects) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${theme.panel} ${theme.panelPadding}`}>
        <p className={`text-sm ${theme.muted}`}>Classes</p>
        <p className={`mt-2 text-3xl font-semibold ${theme.heading}`}>{classes?.length ?? 0}</p>
      </div>
      <div className={`${theme.panel} ${theme.panelPadding}`}>
        <p className={`text-sm ${theme.muted}`}>Subjects</p>
        <p className={`mt-2 text-3xl font-semibold ${theme.heading}`}>{subjects?.length ?? 0}</p>
      </div>
    </div>
  );
}
