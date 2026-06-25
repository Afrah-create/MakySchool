"use client";

import { useState } from "react";
import Link from "next/link";
import { CanDo } from "@/components/ui/CanDo";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { EditStudentPanel } from "@/components/school-admin/students/EditStudentPanel";
import { ReinstateStudentDialog } from "@/components/school-admin/students/ReinstateStudentDialog";
import { StudentTableSkeleton } from "@/components/school-admin/students/StudentRowSkeleton";
import { StudentFeesTab } from "@/components/fees/StudentFeesTab";
import { TransferClassDialog } from "@/components/school-admin/students/TransferClassDialog";
import { WithdrawStudentDialog } from "@/components/school-admin/students/WithdrawStudentDialog";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { StudentDetail } from "@/lib/students/types";
import {
  capitalizeGender,
  formatDobWithAge,
  studentInitials,
} from "@/lib/validation/students";

type Tab = "profile" | "history" | "results" | "fees";

function formatHistoryDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatReason(reason: string | null): string {
  if (!reason) return "—";
  return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StudentDetailContent({ studentId }: { studentId: string }) {
  const [tab, setTab] = useState<Tab>("profile");
  const [editStudent, setEditStudent] = useState<StudentDetail | null>(null);
  const [transferStudent, setTransferStudent] = useState<StudentDetail | null>(null);
  const [withdrawStudent, setWithdrawStudent] = useState<StudentDetail | null>(null);
  const [reinstateStudent, setReinstateStudent] = useState<StudentDetail | null>(null);

  const { data, error, isLoading, mutate } = useApiSWR<StudentDetail>(`/schools/students/${studentId}`);

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
            <StudentTableSkeleton rows={4} />
          </div>
        }
        empty={
          <EmptyState
            title="Student not found."
            description="This student may have been removed or does not belong to your school."
            action={
              <Link href="/dashboard/students" className="ms-btn-secondary inline-flex">
                Back to students
              </Link>
            }
          />
        }
        isEmpty={() => false}
      >
        {(student) => {
          const isActive = student.status === "active";

          return (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {student.photo_url ? (
                    <img
                      src={student.photo_url}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-theme-accent-muted text-lg font-semibold text-theme-accent">
                      {studentInitials(student.full_name)}
                    </span>
                  )}
                  <div>
                    <Link href="/dashboard/students" className="text-xs text-theme-muted hover:text-theme-accent">
                      ← Back to students
                    </Link>
                    <h1 className="mt-1 text-xl font-semibold text-theme-primary">{student.full_name}</h1>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-theme bg-theme-raised px-2.5 py-0.5 font-mono text-xs text-theme-primary">
                        {student.learner_id}
                      </span>
                      {student.class_name ? (
                        <span className="rounded-full bg-theme-accent-muted px-2.5 py-0.5 text-xs font-medium text-theme-accent">
                          {student.class_name}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isActive ? "badge-success" : "badge-danger"
                        }`}
                      >
                        {isActive ? "Active" : "Withdrawn"}
                      </span>
                    </div>
                  </div>
                </div>

                <CanDo action="manageStaff">
                  <div className="flex gap-2">
                    <button type="button" className="ms-btn-secondary" onClick={() => setEditStudent(student)}>
                      Edit
                    </button>
                    <DropdownMenu
                      trigger={<span className="ms-btn-secondary inline-flex px-3 py-2">Actions</span>}
                      items={[
                        { label: "Transfer class", onClick: () => setTransferStudent(student) },
                        {
                          label: isActive ? "Withdraw student" : "Reinstate",
                          variant: isActive ? "danger" : "success",
                          dividerBefore: true,
                          onClick: () =>
                            isActive ? setWithdrawStudent(student) : setReinstateStudent(student),
                        },
                      ]}
                    />
                  </div>
                </CanDo>
              </div>

              <div className="mb-6 flex gap-2 border-b border-theme pb-3">
                {(
                  [
                    ["profile", "Profile"],
                    ["history", "Class History"],
                    ["results", "Results"],
                    ["fees", "Fees"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      tab === key ? "bg-theme-accent text-on-accent" : "text-theme-muted hover:bg-nav-hover"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "profile" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-theme bg-theme-surface p-5">
                      <h2 className="text-sm font-semibold text-theme-primary">Personal details</h2>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-theme-muted">Full name</dt>
                          <dd>{student.full_name}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Date of birth</dt>
                          <dd>{formatDobWithAge(student.date_of_birth)}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Gender</dt>
                          <dd>{capitalizeGender(student.gender)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-xl border border-theme bg-theme-surface p-5">
                      <h2 className="text-sm font-semibold text-theme-primary">Guardian details</h2>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-theme-muted">Guardian name</dt>
                          <dd>{student.guardian?.full_name ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Relationship</dt>
                          <dd>{student.guardian?.relationship ? student.guardian.relationship.charAt(0).toUpperCase() + student.guardian.relationship.slice(1) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Phone</dt>
                          <dd>{student.guardian?.phone ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Email</dt>
                          <dd>{student.guardian?.email ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="rounded-xl border border-theme bg-theme-surface p-5">
                    <h2 className="text-sm font-semibold text-theme-primary">Account</h2>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-theme-muted">Learner ID</dt>
                        <dd className="font-mono">{student.learner_id}</dd>
                      </div>
                      <div>
                        <dt className="text-theme-muted">Date registered</dt>
                        <dd>{new Date(student.created_at).toLocaleDateString()}</dd>
                      </div>
                      <div>
                        <dt className="text-theme-muted">Registered by</dt>
                        <dd>{student.created_by_name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-theme-muted">Current class</dt>
                        <dd>{student.class_name ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : null}

              {tab === "history" ? (
                <div className="rounded-xl border border-theme bg-theme-surface p-5">
                  {student.class_history.length === 0 ? (
                    <EmptyState title="No class history yet." description="Class movements will appear here once recorded." />
                  ) : (
                    <ul className="space-y-4">
                      {student.class_history.map((entry, index) => {
                        const isCurrent = index === 0 && !entry.left_at && isActive;
                        return (
                          <li key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-theme-primary">{entry.class_name}</span>
                            <span className="text-theme-muted">·</span>
                            <span className="text-theme-muted">
                              Enrolled {formatHistoryDate(entry.enrolled_at)}
                              {entry.left_at ? ` → ${formatHistoryDate(entry.left_at)}` : isCurrent ? " · Current" : ""}
                            </span>
                            {entry.reason ? (
                              <>
                                <span className="text-theme-muted">·</span>
                                <span className="rounded-full bg-theme-raised px-2 py-0.5 text-xs text-theme-muted">
                                  {formatReason(entry.reason)}
                                </span>
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              {tab === "results" ? (
                <div className="rounded-xl border border-dashed border-theme bg-theme-surface p-6 text-center">
                  <p className="text-sm font-medium text-theme-primary">Academic results</p>
                  <p className="mt-2 text-sm text-theme-muted">
                    Term results and report cards will appear here when marks are published.
                  </p>
                </div>
              ) : null}

              {tab === "fees" ? <StudentFeesTab studentId={student.id} /> : null}
            </>
          );
        }}
      </QueryState>

      <EditStudentPanel student={editStudent} onClose={() => setEditStudent(null)} onSaved={() => void mutate()} />
      <TransferClassDialog
        student={transferStudent}
        onClose={() => setTransferStudent(null)}
        onSaved={() => void mutate()}
      />
      <WithdrawStudentDialog
        student={withdrawStudent}
        onClose={() => setWithdrawStudent(null)}
        onSaved={() => void mutate()}
      />
      <ReinstateStudentDialog
        student={reinstateStudent}
        onClose={() => setReinstateStudent(null)}
        onSaved={() => void mutate()}
      />
    </DashboardPage>
  );
}
