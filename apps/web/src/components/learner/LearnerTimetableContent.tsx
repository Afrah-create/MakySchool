"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Clock3 } from "lucide-react";
import type { TimetablePeriod } from "@makyschool/shared/types";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { cn } from "@makyschool/ui/lib/cn";
import { useApiSWR } from "@/hooks/useApiSWR";
import {
  TIMETABLE_DAYS,
  TRACK_TONE,
  dayLabelForValue,
  formatTimetableTime,
  todayDayOfWeek,
} from "@/lib/timetable/utils";

type LearnerTimetableResponse = {
  classId: string | null;
  className: string | null;
  termId: string | null;
  periods: TimetablePeriod[];
};

function sortPeriods(periods: TimetablePeriod[]) {
  return [...periods].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.start_time.localeCompare(b.start_time);
  });
}

function LessonCard({ period }: { period: TimetablePeriod }) {
  return (
    <div className="rounded-2xl border border-theme bg-theme-surface p-4 transition hover:border-accent-soft">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex rounded-full bg-theme-accent-muted px-2.5 py-0.5 text-[11px] font-semibold text-theme-accent">
          Period {period.period_number}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-theme-muted">
          <Clock3 className="h-3 w-3" />
          {formatTimetableTime(period.start_time)} – {formatTimetableTime(period.end_time)}
        </span>
      </div>
      <p className="mt-2 text-base font-semibold text-theme-primary">{period.subject_name}</p>
      {period.teacher_name ? (
        <p className="mt-1 text-sm text-theme-muted">{period.teacher_name}</p>
      ) : null}
      <span
        className={cn(
          "mt-3 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
          TRACK_TONE[period.track],
        )}
      >
        {period.track}
      </span>
    </div>
  );
}

function WeekGrid({ periods, today }: { periods: TimetablePeriod[]; today: number }) {
  const periodNumbers = useMemo(
    () =>
      Array.from(new Set(periods.map((period) => period.period_number))).sort((a, b) => a - b),
    [periods],
  );

  if (periodNumbers.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-2xl border border-theme bg-theme-surface">
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
                      <div className="h-full rounded-xl border border-theme/80 bg-theme-page p-2">
                        <p className="truncate text-xs font-semibold text-theme-primary">
                          {period.subject_name}
                        </p>
                        {period.teacher_name ? (
                          <p className="mt-0.5 truncate text-[11px] text-theme-muted">
                            {period.teacher_name}
                          </p>
                        ) : null}
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

export function LearnerTimetableContent() {
  const today = todayDayOfWeek();
  const [selectedDay, setSelectedDay] = useState(today <= 6 ? today : 1);
  const { data, error, isLoading, mutate } = useApiSWR<LearnerTimetableResponse>(
    "/schools/learner/timetable",
  );

  return (
    <DashboardPage embedded maxWidth="7xl">
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        }
        isEmpty={() => false}
      >
        {(timetable) => {
          const periods = sortPeriods(timetable.periods ?? []);
          const todayPeriods = periods.filter((period) => period.day_of_week === today);
          const selectedPeriods = periods.filter((period) => period.day_of_week === selectedDay);
          const subjects = new Set(periods.map((period) => period.subject_name).filter(Boolean)).size;

          if (!timetable.classId) {
            return (
              <EmptyState
                title="No class assigned yet"
                description="Your timetable will appear here once the school places you in a class."
              />
            );
          }

          if (periods.length === 0) {
            return (
              <div className="space-y-5">
                <header className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Learner portal
                  </p>
                  <h1 className="text-xl font-semibold text-theme-primary sm:text-2xl">Timetable</h1>
                  <p className="text-sm text-theme-muted">
                    {timetable.className ?? "Your class"} · Weekly schedule
                  </p>
                </header>
                <EmptyState
                  title="No timetable published yet"
                  description="Your school has not published a class timetable for the current term."
                />
              </div>
            );
          }

          return (
            <div className="space-y-6 sm:space-y-8">
              <div className="ms-hero relative overflow-hidden rounded-2xl p-5 sm:p-7">
                <div className="relative max-w-xl">
                  <p className="text-sm font-medium text-white/80">Class timetable</p>
                  <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                    {timetable.className ?? "Your class"}
                  </h1>
                  <p className="mt-2 text-sm text-white/85">
                    {todayPeriods.length > 0
                      ? `${todayPeriods.length} lesson${todayPeriods.length === 1 ? "" : "s"} today · ${dayLabelForValue(today)}`
                      : `No lessons scheduled for ${dayLabelForValue(today)}.`}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Lessons today", value: todayPeriods.length, icon: CalendarDays },
                  { label: "Lessons this week", value: periods.length, icon: BookOpen },
                  { label: "Subjects", value: subjects, icon: Clock3 },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface px-4 py-3"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs text-theme-muted">{stat.label}</p>
                        <p className="text-xl font-semibold tabular-nums text-theme-primary">
                          {stat.value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile / tablet: day selector + cards */}
              <section className="space-y-4 lg:hidden">
                <div>
                  <h2 className="text-sm font-semibold text-theme-primary">Daily view</h2>
                  <p className="text-xs text-theme-muted">Pick a day to see lessons</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {TIMETABLE_DAYS.map((day) => {
                    const count = periods.filter((p) => p.day_of_week === day.value).length;
                    const active = selectedDay === day.value;
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => setSelectedDay(day.value)}
                        className={cn(
                          "shrink-0 rounded-xl border px-3 py-2 text-left transition",
                          active
                            ? "border-theme-accent bg-theme-accent-muted text-theme-accent"
                            : "border-theme bg-theme-surface text-theme-muted hover:border-accent-soft",
                        )}
                      >
                        <p className="text-xs font-semibold">{day.label}</p>
                        <p className="text-[10px] opacity-80">{count} lesson{count === 1 ? "" : "s"}</p>
                      </button>
                    );
                  })}
                </div>
                {selectedPeriods.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
                    <p className="text-sm font-medium text-theme-primary">No lessons this day</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedPeriods.map((period) => (
                      <LessonCard key={period.id} period={period} />
                    ))}
                  </div>
                )}
              </section>

              {/* Desktop week grid */}
              <section className="hidden space-y-4 lg:block">
                <div>
                  <h2 className="text-sm font-semibold text-theme-primary">Weekly grid</h2>
                  <p className="text-xs text-theme-muted">Full class schedule for the current term</p>
                </div>
                <WeekGrid periods={periods} today={today} />
              </section>
            </div>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
