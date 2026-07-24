"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { StudentAttendancePanel } from "@/components/attendance/StudentAttendancePanel";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { LearnerMe } from "@/lib/learner/types";

export function LearnerAttendanceContent() {
  const { data, error, isLoading, mutate } = useApiSWR<LearnerMe>("/schools/learner/me");

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Learner portal"
      title="Attendance"
      description="Term attendance trends and recent absences for this learner."
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64 w-full rounded-2xl" />}
        isEmpty={() => false}
      >
        {(learner) => (
          <StudentAttendancePanel studentId={learner.id} showNotify={false} />
        )}
      </QueryState>
    </DashboardPage>
  );
}
