"use client";

import type { TimetableGrid } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { TIMETABLE_DAYS, todayDayOfWeek } from "@/lib/timetable/utils";

export function TeacherTimetableCard() {
  const { data, error, isLoading, mutate } = useSchoolSWR<TimetableGrid>(
    "/schools/timetable/teacher/me",
  );
  const today = todayDayOfWeek();

  return (
    <section className="ms-card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-theme-primary">My timetable</h2>
        <p className="text-xs text-theme-muted">Week at a glance for your assigned classes</p>
      </div>

      <QueryState
        isLoading={isLoading && !data}
        error={error}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-40 w-full rounded-xl" />}
        isEmpty={(value) => value.periods.length === 0}
        empty={
          <p className="text-sm text-theme-muted">
            Your timetable will appear here once your school administrator publishes it.
          </p>
        }
      >
        {(grid) => {
          const periodNumbers = Array.from(
            new Set(grid.periods.map((period) => period.period_number)),
          ).sort((a, b) => a - b);

          return (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-theme-muted">Period</th>
                    {TIMETABLE_DAYS.map((day) => (
                      <th
                        key={day.value}
                        className={`px-2 py-1 text-left ${
                          day.value === today ? "rounded-md bg-theme-accent-muted text-theme-accent" : "text-theme-muted"
                        }`}
                      >
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodNumbers.map((periodNumber) => (
                    <tr key={periodNumber}>
                      <td className="px-2 py-2 font-medium text-theme-muted">P{periodNumber}</td>
                      {TIMETABLE_DAYS.map((day) => {
                        const period = grid.periods.find(
                          (item) =>
                            item.day_of_week === day.value &&
                            item.period_number === periodNumber,
                        );
                        const isToday = day.value === today;
                        return (
                          <td
                            key={`${day.value}-${periodNumber}`}
                            className={`px-2 py-2 align-top ${
                              isToday ? "rounded-md bg-theme-accent-muted/60" : ""
                            }`}
                          >
                            {period ? (
                              <div>
                                <p className="font-medium text-theme-primary">{period.subject_name}</p>
                                <p className="text-theme-muted">{period.class_name}</p>
                                <p className="text-theme-muted">
                                  {period.start_time}–{period.end_time}
                                </p>
                              </div>
                            ) : (
                              <span className="text-theme-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}
