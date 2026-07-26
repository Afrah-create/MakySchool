"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, Clock3 } from "lucide-react";
import type { TimetableGrid, TimetablePeriod } from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { cn } from "@makyschool/ui/lib/cn";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import {
  TIMETABLE_DAYS,
  dayLabelForValue,
  formatTimetableTime,
  todayDayOfWeek,
} from "@/lib/timetable/utils";
import { TimetableDayTimeline, TimetableLessonCard } from "@/components/timetable/TimetableDayView";

function sortPeriods(periods: TimetablePeriod[]) {
  return [...periods].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.start_time.localeCompare(b.start_time);
  });
}

function PeriodLessonCard({
  period,
  compact = false,
}: {
  period: TimetablePeriod;
  compact?: boolean;
}) {
  return (
    <TimetableLessonCard period={period} showClass compact={compact} />
  );
}

function TodaySchedule({
  periods,
  today,
  compact = false,
}: {
  periods: TimetablePeriod[];
  today: number;
  compact?: boolean;
}) {
  const todayPeriods = useMemo(
    () =>
      sortPeriods(periods.filter((period) => period.day_of_week === today)).sort(
        (a, b) => a.period_number - b.period_number,
      ),
    [periods, today],
  );

  if (compact) {
    return (
      <TimetableDayTimeline
        periods={todayPeriods}
        emptyLabel="No lessons scheduled today"
        showClass
      />
    );
  }

  if (todayPeriods.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">No lessons scheduled today</p>
        <p className="mt-1 text-sm text-theme-muted">Enjoy your free day or check the weekly view below.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {todayPeriods.map((period) => (
        <PeriodLessonCard key={period.id} period={period} />
      ))}
    </div>
  );
}

function WeekTimetableGrid({
  periods,
  today,
}: {
  periods: TimetablePeriod[];
  today: number;
}) {
  const periodNumbers = useMemo(
    () =>
      Array.from(new Set(periods.map((period) => period.period_number))).sort(
        (a, b) => a - b,
      ),
    [periods],
  );

  if (periodNumbers.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] border-b border-theme bg-sidebar/60 text-xs font-medium">
          <div className="px-3 py-3 text-theme-muted">Period</div>
          {TIMETABLE_DAYS.map((day) => (
            <div
              key={day.value}
              className={cn(
                "px-2 py-3 text-center",
                day.value === today ? "text-theme-accent" : "text-theme-muted",
              )}
            >
              {day.label}
            </div>
          ))}
        </div>

        {periodNumbers.map((periodNumber) => {
          const sample = periods.find((period) => period.period_number === periodNumber);
          return (
            <div
              key={periodNumber}
              className="grid grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] border-b border-theme last:border-b-0"
            >
              <div className="flex flex-col justify-center border-r border-theme px-3 py-3">
                <span className="text-sm font-semibold text-theme-primary">P{periodNumber}</span>
                {sample ? (
                  <span className="mt-0.5 text-[10px] leading-tight text-theme-muted">
                    {formatTimetableTime(sample.start_time)}
                  </span>
                ) : null}
              </div>
              {TIMETABLE_DAYS.map((day) => {
                const period = periods.find(
                  (item) =>
                    item.day_of_week === day.value && item.period_number === periodNumber,
                );
                const isToday = day.value === today;

                return (
                  <div
                    key={`${day.value}-${periodNumber}`}
                    className={cn(
                      "min-h-[5.5rem] border-r border-theme p-2 last:border-r-0",
                      isToday && "bg-theme-accent-muted/30",
                    )}
                  >
                    {period ? (
                      <div className="h-full rounded-lg border border-theme/80 bg-theme-page p-2">
                        <p className="truncate text-xs font-semibold text-theme-primary">
                          {period.subject_name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-theme-muted">
                          {period.class_name}
                        </p>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-theme-faint">·</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimetableSummaryStrip({ periods, today }: { periods: TimetablePeriod[]; today: number }) {
  const lessonsThisWeek = periods.length;
  const lessonsToday = periods.filter((period) => period.day_of_week === today).length;
  const classCount = new Set(periods.map((period) => period.class_id)).size;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Lessons today", value: lessonsToday, icon: CalendarDays },
        { label: "Lessons this week", value: lessonsThisWeek, icon: BookOpen },
        { label: "Classes taught", value: classCount, icon: Clock3 },
      ].map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface px-4 py-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-theme-accent-muted text-theme-accent">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-theme-muted">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums text-theme-primary">{stat.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TeacherTimetableCard({ compact = false }: { compact?: boolean }) {
  const { data, error, isLoading, mutate } = useSchoolSWR<TimetableGrid>(
    "/schools/timetable/teacher/me",
  );
  const today = todayDayOfWeek();
  const todayLabel = dayLabelForValue(today);

  return (
    <section className="space-y-6">
      {!compact ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-theme-primary">My timetable</h2>
            <p className="mt-0.5 text-sm text-theme-muted">
              {todayLabel}&apos;s schedule and your weekly teaching periods
            </p>
          </div>
          <Link
            href="/teacher/classes"
            className="text-sm font-medium text-theme-accent hover:underline"
          >
            View my classes
          </Link>
        </div>
      ) : null}

      <QueryState
        isLoading={isLoading && !data}
        error={error}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            {!compact ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            ) : null}
            <Skeleton className="h-40 w-full rounded-xl" />
            {!compact ? <Skeleton className="h-56 w-full rounded-xl" /> : null}
          </div>
        }
        isEmpty={(value) => value.periods.length === 0}
        empty={
          <EmptyState
            title="Your timetable is not published yet"
            description="Once your school administrator publishes the timetable, your lessons and periods will appear here."
          />
        }
      >
        {(grid) => (
          <div className="space-y-6">
            {!compact ? <TimetableSummaryStrip periods={grid.periods} today={today} /> : null}

            <div className="space-y-3">
              {!compact ? (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-theme-primary">Today — {todayLabel}</h3>
                  <span className="rounded-full bg-theme-accent-muted px-2 py-0.5 text-[11px] font-medium text-theme-accent">
                    {grid.periods.filter((period) => period.day_of_week === today).length} periods
                  </span>
                </div>
              ) : null}
              <TodaySchedule periods={grid.periods} today={today} compact={compact} />
            </div>

            {!compact ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-theme-primary">Weekly overview</h3>
                <WeekTimetableGrid periods={grid.periods} today={today} />
              </div>
            ) : null}
          </div>
        )}
      </QueryState>
    </section>
  );
}
