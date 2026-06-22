"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Users } from "lucide-react";
import { formatClassLabel } from "@makyschool/shared/constants";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";

type ClassDetail = {
  id: string;
  level: string;
  stream: string | null;
  student_count: number;
  subjects: Array<{ id: string; name: string }>;
  teacher_subjects: Array<{ id: string; name: string }>;
};

type StudentRow = {
  id: string;
  name: string;
  learner_id: string | null;
  gender: string | null;
};

type Tab = "students" | "marks" | "subjects";

export function TeacherClassDetailContent({ classId }: { classId: string }) {
  const [tab, setTab] = useState<Tab>("students");
  const classQuery = useApiSWR<ClassDetail>(`/schools/classes/${classId}`);
  const studentsQuery = useApiSWR<StudentRow[]>(
    tab === "students" ? `/schools/classes/${classId}/students` : null,
  );

  return (
    <DashboardPage maxWidth="7xl">
      <QueryState
        error={classQuery.error}
        isLoading={classQuery.isLoading}
        data={classQuery.data}
        onRetry={() => void classQuery.mutate()}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
            <SkeletonTable rows={4} />
          </div>
        }
        empty={
          <EmptyState
            title="Class not found"
            description="This class is not available or you do not have access."
            action={
              <Link href="/teacher/classes" className="ms-btn-secondary inline-flex">
                Back to my classes
              </Link>
            }
          />
        }
        isEmpty={() => false}
      >
        {(classData) => {
          const classLabel = formatClassLabel(classData.level, classData.stream);
          const taughtSubjects =
            classData.teacher_subjects?.length > 0
              ? classData.teacher_subjects
              : classData.subjects ?? [];

          return (
            <>
              <div className="mb-6">
                <Link
                  href="/teacher/classes"
                  className="text-xs text-theme-muted hover:text-theme-accent"
                >
                  ← Back to my classes
                </Link>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-semibold text-theme-primary">{classLabel}</h1>
                    <p className="mt-1 text-sm text-theme-muted">
                      {taughtSubjects.map((subject) => subject.name).join(", ") || "No subjects assigned"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-theme-accent" />
                    <div>
                      <p className="text-xs text-theme-muted">Students</p>
                      <p className="text-2xl font-semibold text-theme-primary">
                        {classData.student_count > 0 ? classData.student_count : "—"}
                      </p>
                      {/* TODO: Ssekyanzi — student count */}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-theme-accent" />
                    <div>
                      <p className="text-xs text-theme-muted">Your subjects</p>
                      <p className="text-2xl font-semibold text-theme-primary">{taughtSubjects.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 flex gap-2 border-b border-theme pb-3">
                {(
                  [
                    ["students", "Students"],
                    ["marks", "Marks"],
                    ["subjects", "Subjects"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      tab === key
                        ? "bg-theme-accent text-on-accent"
                        : "text-theme-muted hover:bg-nav-hover"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "students" ? (
                <QueryState
                  error={studentsQuery.error}
                  isLoading={studentsQuery.isLoading}
                  data={studentsQuery.data}
                  onRetry={() => void studentsQuery.mutate()}
                  loading={<SkeletonTable rows={5} />}
                  isEmpty={(rows) => rows.length === 0}
                  empty={
                    <EmptyState
                      title="No students in this class yet"
                      description="Students enrolled in this class will appear here."
                    />
                  }
                >
                  {(rows) => (
                    <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                      <table className="ms-table w-full">
                        <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                          <tr>
                            <th className="px-4 py-3 text-left">Name</th>
                            <th className="px-4 py-3 text-left">Learner ID</th>
                            <th className="px-4 py-3 text-left">Gender</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((student) => (
                            <tr key={student.id} className="border-t border-theme">
                              <td className="px-4 py-3 font-medium text-theme-primary">{student.name}</td>
                              <td className="px-4 py-3 text-theme-muted">{student.learner_id || "—"}</td>
                              <td className="px-4 py-3 capitalize text-theme-muted">
                                {student.gender || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </QueryState>
              ) : null}

              {tab === "marks" ? (
                <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-10 text-center">
                  <p className="text-sm font-medium text-theme-primary">Marks entry coming soon</p>
                  <p className="mt-2 text-sm text-theme-muted">
                    {/* TODO: Kweko — marks entry */}
                    You will be able to enter and submit term marks from here.
                  </p>
                </div>
              ) : null}

              {tab === "subjects" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {taughtSubjects.length === 0 ? (
                    <EmptyState
                      title="No subjects assigned"
                      description="Subjects you teach in this class will be listed here."
                    />
                  ) : (
                    taughtSubjects.map((subject) => (
                      <div
                        key={subject.id}
                        className="rounded-xl border border-theme bg-theme-surface px-4 py-4 text-sm font-medium text-theme-primary"
                      >
                        {subject.name}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
