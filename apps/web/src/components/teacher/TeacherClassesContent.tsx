"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { buildTeacherClassMap } from "@/lib/teacher/utils";
import { TeacherClassGrid, TeacherStatsRow } from "./TeacherClassCard";

export function TeacherClassesContent() {
  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>("/schools/teachers/me");

  return (
    <DashboardPage
      embedded
      eyebrow="Teacher portal"
      title="My Classes"
      description="Classes and subjects assigned to you this term."
      maxWidth="7xl"
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          </div>
        }
        isEmpty={(teacher) => buildTeacherClassMap(teacher.assignments).size === 0}
        empty={
          <EmptyState
            title="No classes assigned yet"
            description="Your school administrator will assign classes here when you are ready to teach."
          />
        }
      >
        {(teacher) => (
          <div className="space-y-8">
            <TeacherStatsRow teacher={teacher} />
            <TeacherClassGrid teacher={teacher} />
          </div>
        )}
      </QueryState>
    </DashboardPage>
  );
}
