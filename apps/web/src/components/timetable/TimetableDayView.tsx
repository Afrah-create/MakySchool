"use client";

import { useMemo } from "react";
import type { TimetablePeriod } from "@makyschool/shared/types";
import { cn } from "@makyschool/ui/lib/cn";
import {
  TRACK_TONE,
  formatTimetableTime,
} from "@/lib/timetable/utils";

function sortByPeriod(periods: TimetablePeriod[]) {
  return [...periods].sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.start_time.localeCompare(b.start_time);
  });
}

/** Polished lesson card used on teacher/learner dashboards and timetable pages. */
export function TimetableLessonCard({
  period,
  showClass = false,
  showTeacher = false,
  compact = false,
}: {
  period: TimetablePeriod;
  showClass?: boolean;
  showTeacher?: boolean;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-theme-card",
        compact ? "p-3" : "p-3.5 sm:p-4",
      )}
    >
      <div
        className="absolute inset-y-0 left-0 w-1 bg-theme-accent"
        aria-hidden
      />
      <div className="pl-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex rounded-full bg-theme-accent-muted px-2 py-0.5 text-[11px] font-semibold text-theme-accent">
            P{period.period_number}
          </span>
          <span className="tabular-nums text-[11px] font-medium text-theme-muted">
            {formatTimetableTime(period.start_time)}–{formatTimetableTime(period.end_time)}
          </span>
        </div>
        <p
          className={cn(
            "mt-2 font-semibold text-theme-primary",
            compact ? "text-sm" : "text-[15px] sm:text-base",
          )}
        >
          {period.subject_name}
        </p>
        {showClass && period.class_name ? (
          <p className="mt-0.5 text-sm text-theme-muted">{period.class_name}</p>
        ) : null}
        {showTeacher && period.teacher_name ? (
          <p className="mt-0.5 text-sm text-theme-muted">{period.teacher_name}</p>
        ) : null}
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
            TRACK_TONE[period.track],
          )}
        >
          {period.track}
        </span>
      </div>
    </article>
  );
}

/** Vertical timeline of today's (or a selected day's) lessons. */
export function TimetableDayTimeline({
  periods,
  emptyLabel = "No lessons scheduled",
  showClass = false,
  showTeacher = false,
}: {
  periods: TimetablePeriod[];
  emptyLabel?: string;
  showClass?: boolean;
  showTeacher?: boolean;
}) {
  const sorted = useMemo(() => sortByPeriod(periods), [periods]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-theme bg-theme-surface/80 px-4 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {sorted.map((period, index) => (
        <li key={period.id} className="relative flex gap-3 pb-3 last:pb-0">
          <div className="flex w-11 shrink-0 flex-col items-center">
            <span className="rounded-lg bg-theme-accent-muted px-1.5 py-1 text-center text-[10px] font-bold leading-tight text-theme-accent">
              {formatTimetableTime(period.start_time)}
            </span>
            {index < sorted.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-theme-accent/25" aria-hidden />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <TimetableLessonCard
              period={period}
              showClass={showClass}
              showTeacher={showTeacher}
              compact
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
