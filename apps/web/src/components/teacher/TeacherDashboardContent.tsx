"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { buildTeacherClassMap } from "@/lib/teacher/utils";
import { teacherFirstName } from "@/lib/validation/teachers";
import { TeacherClassGrid, TeacherStatsRow } from "./TeacherClassCard";

export function TeacherDashboardContent() {
  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>("/schools/teachers/me");

  return (
    <DashboardPage maxWidth="7xl">
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          </div>
        }
        isEmpty={() => false}
      >
        {(teacher) => {
          const classMap = buildTeacherClassMap(teacher.assignments);
          const hasClasses = classMap.size > 0;

          return (
            <div className="space-y-8">
              <div className="ms-hero relative overflow-hidden rounded-2xl p-6 sm:p-8">
                <div className="relative max-w-2xl">
                  <p className="text-sm font-medium text-white/80">Teacher portal</p>
                  <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                    Welcome back, {teacherFirstName(teacher.full_name)}
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

              {hasClasses ? (
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-theme-primary">Recent classes</h2>
                      <p className="text-xs text-theme-muted">Quick access to your assigned classes</p>
                    </div>
                    <Link
                      href="/teacher/classes"
                      className="inline-flex items-center gap-1 text-sm font-medium text-theme-accent hover:underline"
                    >
                      View all classes
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
