"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Shield } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { buildTeacherClassMap } from "@/lib/teacher/utils";
import { teacherFirstName } from "@/lib/validation/teachers";
import { TeacherClassGrid, TeacherStatsRow } from "./TeacherClassCard";
import { TeacherTimetableCard } from "./TeacherTimetableCard";

export function TeacherDashboardContent() {
  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>("/schools/teachers/me");

  return (
    <DashboardPage maxWidth="7xl" embedded>
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-5">
            <Skeleton className="h-20 w-full rounded-2xl sm:h-32" />
            <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2">
              <Skeleton className="h-24 min-w-[10rem] flex-1" />
              <Skeleton className="h-24 min-w-[10rem] flex-1" />
            </div>
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        }
        isEmpty={() => false}
      >
        {(teacher) => {
          const classMap = buildTeacherClassMap(teacher.assignments);
          const hasClasses = classMap.size > 0;
          const firstName = teacherFirstName(teacher.full_name);

          return (
            <div className="space-y-6 sm:space-y-8">
              <div className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-3.5 sm:hidden">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-theme-accent-muted text-sm font-semibold text-theme-accent">
                  {firstName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-theme-muted">Welcome back</p>
                  <h1 className="truncate text-lg font-semibold text-theme-primary">{firstName}</h1>
                  <p className="mt-0.5 truncate text-xs text-theme-muted">
                    {hasClasses
                      ? `${classMap.size} class${classMap.size === 1 ? "" : "es"} this term`
                      : "No classes assigned yet"}
                    {teacher.subject_specialization
                      ? ` · ${teacher.subject_specialization}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="ms-hero relative hidden overflow-hidden rounded-2xl p-6 sm:block sm:p-8">
                <div className="relative max-w-2xl">
                  <p className="text-sm font-medium text-white/80">Teacher portal</p>
                  <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                    Welcome back, {firstName}
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-white/85">
                    {hasClasses
                      ? `You are teaching ${classMap.size} class${classMap.size === 1 ? "" : "es"} this term.`
                      : "Your class assignments will appear here once your administrator adds them."}
                  </p>
                  {teacher.subject_specialization ? (
                    <span className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
                      {teacher.subject_specialization}
                    </span>
                  ) : null}
                </div>
              </div>

              <TeacherStatsRow teacher={teacher} />

              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                <Link
                  href="/teacher/attendance"
                  className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-3.5 transition hover:border-accent-soft sm:p-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-theme-primary">Take attendance</p>
                    <p className="text-xs text-theme-muted">Mark today&apos;s lessons</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
                </Link>
                <Link
                  href="/teacher/discipline"
                  className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-3.5 transition hover:border-accent-soft sm:p-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-icon text-theme-muted">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-theme-primary">Discipline</p>
                    <p className="text-xs text-theme-muted">Review incidents you logged</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
                </Link>
              </div>

              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-theme-primary">Today&apos;s schedule</h2>
                    <p className="text-xs text-theme-muted">Your lessons for today</p>
                  </div>
                  <Link
                    href="/teacher/timetable"
                    className="inline-flex items-center gap-1 text-sm font-medium text-theme-accent hover:underline"
                  >
                    Full timetable
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="rounded-2xl border border-theme bg-theme-surface/70 p-3.5 sm:bg-theme-page sm:p-5">
                  <TeacherTimetableCard compact />
                </div>
              </section>

              {hasClasses ? (
                <section className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-theme-primary">My classes</h2>
                      <p className="text-xs text-theme-muted">Quick access to your assigned classes</p>
                    </div>
                    <Link
                      href="/teacher/classes"
                      className="inline-flex items-center gap-1 text-sm font-medium text-theme-accent hover:underline"
                    >
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <TeacherClassGrid teacher={teacher} limit={3} />
                </section>
              ) : (
                <EmptyState
                  title="You haven't been assigned to any classes yet."
                  description="Contact your school administrator to get started."
                />
              )}
            </div>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
