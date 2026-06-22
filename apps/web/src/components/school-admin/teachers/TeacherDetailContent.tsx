"use client";

import { useState } from "react";
import Link from "next/link";
import { CanDo } from "@/components/ui/CanDo";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { DeactivateDialog } from "@/components/school-admin/teachers/DeactivateDialog";
import { EditTeacherPanel } from "@/components/school-admin/teachers/EditTeacherPanel";
import { ReactivateDialog } from "@/components/school-admin/teachers/ReactivateDialog";
import { ResetPasswordDialog } from "@/components/school-admin/teachers/ResetPasswordDialog";
import { TeacherTableSkeleton } from "@/components/school-admin/teachers/TeacherRowSkeleton";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { marksStatusLabel, teacherInitials } from "@/lib/validation/teachers";

type Tab = "overview" | "classes" | "activity";

export function TeacherDetailContent({ teacherId }: { teacherId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editTeacher, setEditTeacher] = useState<TeacherDetail | null>(null);
  const [deactivateTeacher, setDeactivateTeacher] = useState<TeacherDetail | null>(null);
  const [reactivateTeacher, setReactivateTeacher] = useState<TeacherDetail | null>(null);
  const [resetTeacher, setResetTeacher] = useState<TeacherDetail | null>(null);

  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>(`/schools/teachers/${teacherId}`);

  const distinctClasses = new Set((data?.assignments ?? []).map((item) => item.class_id)).size;
  const submittedCount =
    data?.submission_status.filter((item) => item.status === "submitted").length ?? 0;

  return (
    <DashboardPage maxWidth="7xl">
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <TeacherTableSkeleton rows={4} />
          </div>
        }
        empty={
          <EmptyState
            title="Teacher not found."
            description="This teacher may have been removed or does not belong to your school."
            action={
              <Link href="/dashboard/teachers" className="ms-btn-secondary inline-flex">
                Back to teachers
              </Link>
            }
          />
        }
        isEmpty={() => false}
      >
        {(teacher) => (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-theme-accent-muted text-lg font-semibold text-theme-accent">
                  {teacherInitials(teacher.full_name)}
                </span>
                <div>
                  <Link href="/dashboard/teachers" className="text-xs text-theme-muted hover:text-theme-accent">
                    ← Back to teachers
                  </Link>
                  <h1 className="mt-1 text-xl font-semibold text-theme-primary">{teacher.full_name}</h1>
                  <p className="text-sm text-theme-muted">{teacher.email}</p>
                  {teacher.phone ? <p className="text-sm text-theme-muted">{teacher.phone}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <span className="badge-role-teacher rounded-full px-2.5 py-0.5 text-xs font-medium">Teacher</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${teacher.is_active ? "badge-success" : "badge-danger"}`}>
                      {teacher.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
              <CanDo action="manageUsers">
                <div className="flex gap-2">
                  <button type="button" className="ms-btn-secondary" onClick={() => setEditTeacher(teacher)}>
                    Edit
                  </button>
                  <DropdownMenu
                    trigger={<span className="ms-btn-secondary inline-flex px-3 py-2">Actions</span>}
                    items={[
                      { label: "Reset password", onClick: () => setResetTeacher(teacher) },
                      {
                        label: teacher.is_active ? "Deactivate" : "Reactivate",
                        variant: teacher.is_active ? "danger" : "success",
                        dividerBefore: true,
                        onClick: () =>
                          teacher.is_active ? setDeactivateTeacher(teacher) : setReactivateTeacher(teacher),
                      },
                    ]}
                  />
                </div>
              </CanDo>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-theme bg-theme-surface p-5">
                <p className="text-xs text-theme-muted">Assigned classes</p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">{distinctClasses}</p>
              </div>
              <div className="rounded-xl border border-theme bg-theme-surface p-5">
                <p className="text-xs text-theme-muted">Total students</p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {teacher.total_students > 0 ? teacher.total_students : "—"}
                </p>
                {/* TODO: Ssekyanzi — student count */}
              </div>
              <div className="rounded-xl border border-theme bg-theme-surface p-5">
                <p className="text-xs text-theme-muted">Marks this term</p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {submittedCount} / {teacher.submission_status.length} submitted
                </p>
                {/* TODO: Kweko — marks entry */}
              </div>
            </div>

            <div className="mb-6 flex gap-2 border-b border-theme pb-3">
              {(["overview", "classes", "activity"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                    tab === key ? "bg-theme-accent text-on-accent" : "text-theme-muted hover:bg-nav-hover"
                  }`}
                >
                  {key === "classes" ? "Assigned Classes" : key}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <h2 className="text-sm font-semibold text-theme-primary">Personal details</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div><dt className="text-theme-muted">Full name</dt><dd>{teacher.full_name}</dd></div>
                    <div><dt className="text-theme-muted">Email</dt><dd>{teacher.email}</dd></div>
                    <div><dt className="text-theme-muted">Phone</dt><dd>{teacher.phone || "—"}</dd></div>
                    <div><dt className="text-theme-muted">Subject specialisation</dt><dd>{teacher.subject_specialization || "—"}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  <h2 className="text-sm font-semibold text-theme-primary">Account details</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div><dt className="text-theme-muted">Role</dt><dd>Teacher</dd></div>
                    <div><dt className="text-theme-muted">Status</dt><dd>{teacher.is_active ? "Active" : "Inactive"}</dd></div>
                    <div><dt className="text-theme-muted">Date created</dt><dd>{new Date(teacher.created_at).toLocaleDateString()}</dd></div>
                    <div><dt className="text-theme-muted">Last login</dt><dd>{teacher.last_login ? new Date(teacher.last_login).toLocaleString() : "Never"}</dd></div>
                    <div><dt className="text-theme-muted">Created by</dt><dd>{teacher.created_by_name || "—"}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl border border-dashed border-theme bg-theme-surface p-5 lg:col-span-2">
                  <p className="text-sm text-theme-muted">TODO: Kweko — marks submission will appear here</p>
                </div>
              </div>
            ) : null}

            {tab === "classes" ? (
              <div className="space-y-4">
                <CanDo action="manageUsers">
                  <button type="button" className="ms-btn-secondary" onClick={() => setEditTeacher(teacher)}>
                    Edit assignments
                  </button>
                </CanDo>
                {teacher.assignments.length === 0 ? (
                  <EmptyState title="No classes assigned." description="Edit this teacher to assign classes." />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-theme">
                    <table className="ms-table w-full">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Stream</th>
                          <th>Subjects</th>
                          <th>Students</th>
                          <th>Marks status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacher.assignments.map((row, index) => {
                          const submission = teacher.submission_status.find((s) => s.class_name === row.class_name);
                          return (
                            <tr key={`${row.assignment_id ?? row.class_id}-${index}`}>
                              <td className="font-medium">{row.class_name}</td>
                              <td>{row.stream || "—"}</td>
                              <td>{row.subject_name || "—"}</td>
                              <td>—</td>
                              <td>{submission ? marksStatusLabel(submission.status) : "Pending"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "activity" ? (
              <div className="rounded-xl border border-theme bg-theme-surface p-6">
                <p className="text-sm text-theme-primary">
                  Last seen: {teacher.last_login ? new Date(teacher.last_login).toLocaleString() : "Never logged in"}
                </p>
                <p className="mt-4 text-sm text-theme-muted">TODO: Activity log — Week 2</p>
              </div>
            ) : null}
          </>
        )}
      </QueryState>

      <EditTeacherPanel teacher={editTeacher} onClose={() => setEditTeacher(null)} onSaved={() => void mutate()} />
      <DeactivateDialog
        teacher={deactivateTeacher}
        onClose={() => setDeactivateTeacher(null)}
        onSaved={() => void mutate()}
      />
      <ReactivateDialog
        teacher={reactivateTeacher}
        onClose={() => setReactivateTeacher(null)}
        onSaved={() => void mutate()}
      />
      <ResetPasswordDialog teacher={resetTeacher} onClose={() => setResetTeacher(null)} />
    </DashboardPage>
  );
}
