"use client";

import Link from "next/link";
import { BookOpen, Users } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { marksStatusLabel, teacherFirstName } from "@/lib/validation/teachers";

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
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          </div>
        }
        isEmpty={(teacher) => teacher.assignments.length === 0}
        empty={
          <EmptyState
            title="You haven't been assigned to any classes yet."
            description="Contact your school administrator."
          />
        }
      >
        {(teacher) => {
          const classMap = new Map<string, TeacherDetail["assignments"]>();
          for (const item of teacher.assignments) {
            const list = classMap.get(item.class_id) ?? [];
            list.push(item);
            classMap.set(item.class_id, list);
          }

          return (
            <>
              <div className="mb-8">
                <p className="text-sm text-theme-muted">Teacher portal</p>
                <h1 className="text-xl font-semibold text-theme-primary">
                  Welcome back, {teacherFirstName(teacher.full_name)}
                </h1>
              </div>

              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-theme-accent" />
                    <div>
                      <p className="text-xs text-theme-muted">My classes</p>
                      <p className="text-2xl font-semibold text-theme-primary">{classMap.size}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-theme-accent" />
                    <div>
                      <p className="text-xs text-theme-muted">My students</p>
                      <p className="text-2xl font-semibold text-theme-primary">
                        {teacher.total_students > 0 ? teacher.total_students : "—"}
                      </p>
                      {/* TODO: Ssekyanzi — student count */}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...classMap.entries()].map(([classId, assignments]) => {
                  const className = assignments[0]?.class_name ?? "Class";
                  const subjects = assignments.map((a) => a.subject_name).filter(Boolean);
                  const submission = teacher.submission_status.find((s) => s.class_name === className);

                  return (
                    <div key={classId} className="rounded-xl border border-theme bg-theme-surface p-5">
                      <h3 className="text-lg font-semibold text-theme-primary">{className}</h3>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {subjects.length
                          ? subjects.map((name) => (
                              <span key={name} className="badge-info rounded-full px-2 py-0.5 text-xs">
                                {name}
                              </span>
                            ))
                          : null}
                      </div>
                      <p className="mt-3 flex items-center gap-1 text-sm text-theme-muted">
                        <Users className="h-4 w-4" />
                        — students
                      </p>
                      <p className="mt-2 text-xs text-theme-faint">
                        {/* TODO: Kweko — marks entry */}
                        Marks: {submission ? marksStatusLabel(submission.status) : "Pending"}
                      </p>
                      <Link
                        href={`/teacher/classes/${classId}`}
                        className="mt-4 inline-block text-sm font-medium text-theme-accent hover:underline"
                      >
                        View class →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
