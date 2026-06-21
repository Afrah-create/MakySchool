"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, BookOpen, ChevronRight } from "lucide-react";
import { formatClassLabel } from "@makyschool/shared/constants";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonAttentionList } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useAuth } from "@/hooks/useAuth";
import { useSchool } from "@/providers/SchoolProvider";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getWeekDays(reference = new Date()) {
  const start = new Date(reference);
  const day = start.getDay();
  start.setDate(start.getDate() - day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DashboardRightRail() {
  const { state } = useAuth();
  const { school } = useSchool();
  const today = new Date();
  const weekDays = getWeekDays(today);

  const { data: classes, isLoading, isValidating, error, mutate } =
    useSchoolSWR<ClassWithDetails[]>("/schools/classes");

  const displayName = state.user?.name?.split(" ")[0] ?? "Admin";
  const monthLabel = today.toLocaleString("default", { month: "long" });

  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-theme-primary">
            {state.user?.name ?? "School admin"}
          </p>
          <p className="truncate text-xs text-theme-muted">{school?.name ?? "Your school"}</p>
        </div>
        {school?.logo_url ? (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-theme bg-input">
            <Image src={school.logo_url} alt="" fill className="object-contain p-1" unoptimized />
          </div>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-sm font-bold text-theme-accent">
            {(school?.name ?? displayName).charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <section className="ms-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-theme-primary">Schedule</h2>
          <span className="text-xs text-theme-muted">{monthLabel}</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {weekDays.map((date) => {
            const active = isSameDay(date, today);
            return (
              <div key={date.toISOString()} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-theme-muted">
                  {WEEKDAY_LABELS[date.getDay()]}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-theme-accent text-on-accent shadow-theme-accent"
                      : "text-theme-primary"
                  }`}
                >
                  {date.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="min-h-0 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-theme-primary">Needs attention</h2>
          <Link
            href="/dashboard/classes"
            className="text-xs font-medium text-theme-accent hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mt-3">
          <QueryState
            isLoading={isLoading}
            isValidating={isValidating}
            error={error}
            data={classes}
            onRetry={() => void mutate()}
            loading={<SkeletonAttentionList rows={3} />}
            isEmpty={(items) => {
              const needsAttention = items.filter(
                (classRow) =>
                  classRow.subjects.length === 0 ||
                  (classRow.capacity != null && classRow.student_count >= classRow.capacity),
              );
              return needsAttention.length === 0;
            }}
            empty={
              <div className="ms-card p-4 text-sm text-theme-muted">
                Everything looks good. No classes need action right now.
              </div>
            }
            showRefreshing={false}
          >
            {(items) => {
              const needsAttention = items.filter(
                (classRow) =>
                  classRow.subjects.length === 0 ||
                  (classRow.capacity != null && classRow.student_count >= classRow.capacity),
              );

              return (
                <div className="space-y-2">
                  {needsAttention.slice(0, 5).map((classRow) => {
                    const label = formatClassLabel(classRow.level, classRow.stream);
                    const atCapacity =
                      classRow.capacity != null && classRow.student_count >= classRow.capacity;

                    return (
                      <Link
                        key={classRow.id}
                        href="/dashboard/classes"
                        className="ms-card flex items-center gap-3 p-3 transition hover:border-accent-soft"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            atCapacity ? "badge-warning" : "badge-info"
                          }`}
                        >
                          {atCapacity ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-theme-primary">{label}</p>
                          <p className="truncate text-xs text-theme-muted">
                            {atCapacity
                              ? `At capacity (${classRow.student_count}/${classRow.capacity})`
                              : "No subjects linked yet"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-theme-muted" />
                      </Link>
                    );
                  })}
                </div>
              );
            }}
          </QueryState>
        </div>
      </section>
    </div>
  );
}
