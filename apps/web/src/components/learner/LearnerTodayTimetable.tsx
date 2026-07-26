"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TimetablePeriod } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { TimetableDayTimeline } from "@/components/timetable/TimetableDayView";
import { dayLabelForValue, todayDayOfWeek } from "@/lib/timetable/utils";

type LearnerTimetableResponse = {
  classId: string | null;
  className: string | null;
  periods: TimetablePeriod[];
};

/** Compact “today’s lessons” block for the learner dashboard. */
export function LearnerTodayTimetable() {
  const today = todayDayOfWeek();
  const { data, error, isLoading, mutate } = useApiSWR<LearnerTimetableResponse>(
    "/schools/learner/timetable",
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-theme-primary">Today&apos;s lessons</h2>
          <p className="text-xs text-theme-muted">{dayLabelForValue(today)}</p>
        </div>
        <Link
          href="/learner/timetable"
          className="inline-flex items-center gap-1 text-sm font-medium text-theme-accent hover:underline"
        >
          Full timetable
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-2xl border border-theme bg-theme-surface/70 p-3.5 sm:p-4">
        <QueryState
          error={error}
          isLoading={isLoading && !data}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="h-36 w-full rounded-xl" />}
          isEmpty={() => false}
        >
          {(timetable) => {
            if (!timetable.classId) {
              return (
                <p className="py-6 text-center text-sm text-theme-muted">
                  Assign a class to see today&apos;s timetable.
                </p>
              );
            }
            const todayPeriods = (timetable.periods ?? []).filter(
              (period) => period.day_of_week === today,
            );
            return (
              <TimetableDayTimeline
                periods={todayPeriods}
                emptyLabel="No lessons scheduled today"
                showTeacher
              />
            );
          }}
        </QueryState>
      </div>
    </section>
  );
}
