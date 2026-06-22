"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus, Search, Users } from "lucide-react";
import { formatClassLabel } from "@makyschool/shared/constants";
import { CanDo } from "@/components/ui/CanDo";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { AddTeacherPanel } from "@/components/school-admin/teachers/AddTeacherPanel";
import { DeactivateDialog } from "@/components/school-admin/teachers/DeactivateDialog";
import { EditTeacherPanel } from "@/components/school-admin/teachers/EditTeacherPanel";
import { ReactivateDialog } from "@/components/school-admin/teachers/ReactivateDialog";
import { ResetPasswordDialog } from "@/components/school-admin/teachers/ResetPasswordDialog";
import { TeacherTableSkeleton } from "@/components/school-admin/teachers/TeacherRowSkeleton";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api/client";
import { can } from "@makyschool/shared/constants";
import type { ClassOption, TeacherDetail, TeacherListItem, TeachersListResponse } from "@/lib/teachers/types";
import { teacherInitials } from "@/lib/validation/teachers";

const PAGE_SIZE = 20;

function uniqueClassPills(assignments: TeacherListItem["assignments"]) {
  const seen = new Set<string>();
  const pills: string[] = [];
  for (const item of assignments) {
    const label = item.class_name ?? "Class";
    if (!seen.has(label)) {
      seen.add(label);
      pills.push(label);
    }
  }
  return pills;
}

export function TeachersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const canManage = state.user ? can(state.user.role, "manageUsers") : false;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [addOpen, setAddOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<TeacherDetail | null>(null);
  const [deactivateTeacher, setDeactivateTeacher] = useState<TeacherListItem | null>(null);
  const [reactivateTeacher, setReactivateTeacher] = useState<TeacherListItem | null>(null);
  const [resetTeacher, setResetTeacher] = useState<TeacherListItem | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status) params.set("is_active", status);
    if (classId) params.set("class_id", classId);
    return `/schools/teachers?${params.toString()}`;
  }, [page, debouncedSearch, status, classId]);

  const { data, error, isLoading, mutate } = useApiSWR<TeachersListResponse>(query);
  const { data: classes } = useApiSWR<ClassOption[]>("/schools/classes");

  const teachers = data?.teachers ?? [];
  const total = data?.total ?? 0;
  const hasFilters = Boolean(debouncedSearch || status || classId);

  useEffect(() => {
    if (searchParams.get("add") === "1" && canManage) {
      setAddOpen(true);
      router.replace("/dashboard/teachers", { scroll: false });
    }
  }, [searchParams, canManage, router]);

  async function openEdit(teacher: TeacherListItem) {
    const response = await apiClient<TeacherDetail>(`/schools/teachers/${teacher.id}`);
    setEditTeacher(response.data);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-theme-primary">Teachers</h1>
          <p className="mt-1 text-sm text-theme-muted">Manage teaching staff and class assignments</p>
        </div>
        <CanDo action="manageUsers">
          <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add teacher
          </button>
        </CanDo>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search teachers"
            className="ms-input w-full pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["", "true", "false"] as const).map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                status === value ? "bg-theme-accent text-on-accent" : "text-theme-muted hover:bg-nav-hover"
              }`}
            >
              {value === "" ? "All teachers" : value === "true" ? "Active" : "Inactive"}
            </button>
          ))}
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
            className="ms-input w-auto min-w-[160px]"
          >
            <option value="">All classes</option>
            {(classes ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {formatClassLabel(item.level, item.stream)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<TeacherTableSkeleton />}
        isEmpty={(payload) => payload.teachers.length === 0}
        empty={
          hasFilters ? (
            <EmptyState
              title="No teachers match your search."
              description="Try adjusting your filters."
              action={
                <button
                  type="button"
                  className="text-sm font-medium text-theme-accent hover:underline"
                  onClick={() => {
                    setSearch("");
                    setStatus("");
                    setClassId("");
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="rounded-xl border border-theme bg-theme-surface py-20 text-center">
              <Users className="mx-auto h-10 w-10 text-theme-faint" />
              <h2 className="mt-4 text-lg font-semibold text-theme-primary">No teachers yet</h2>
              <p className="mt-1 text-sm text-theme-muted">Add your first teacher to get started.</p>
              <CanDo action="manageUsers">
                <button type="button" className="ms-btn-primary mt-6" onClick={() => setAddOpen(true)}>
                  Add teacher
                </button>
              </CanDo>
            </div>
          )
        }
      >
        {(payload) => (
          <>
            <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
              <table className="min-w-full">
                <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Teacher</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">Specialisation</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">Assigned classes</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">Students</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.teachers.map((teacher) => {
                    const isActive = optimistic[teacher.id] ?? teacher.is_active;
                    const classPills = uniqueClassPills(teacher.assignments);
                    const visible = classPills.slice(0, 3);
                    const overflow = classPills.length - visible.length;

                    return (
                      <tr key={teacher.id} className="border-t border-theme transition-colors hover:bg-table-row-hover">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-sm font-semibold text-theme-accent">
                              {teacherInitials(teacher.full_name)}
                            </span>
                            <div>
                              <Link href={`/dashboard/teachers/${teacher.id}`} className="font-semibold text-theme-primary hover:text-theme-accent">
                                {teacher.full_name}
                              </Link>
                              <p className="text-xs text-theme-muted">{teacher.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-4 text-sm text-theme-muted md:table-cell">
                          {teacher.subject_specialization || "—"}
                        </td>
                        <td className="hidden px-4 py-4 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {visible.map((pill) => (
                              <span key={pill} className="badge-info rounded-full px-2 py-0.5 text-xs">
                                {pill}
                              </span>
                            ))}
                            {overflow > 0 ? (
                              <span className="rounded-full bg-theme-surface-raised px-2 py-0.5 text-xs text-theme-muted">
                                +{overflow} more
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden px-4 py-4 text-right text-sm text-theme-muted sm:table-cell">
                          {teacher.total_students > 0 ? teacher.total_students : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isActive ? "badge-success" : "badge-danger"}`}>
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu
                            trigger={
                              <span className="inline-flex rounded-lg p-2 hover:bg-nav-hover">
                                <MoreHorizontal className="h-4 w-4 text-theme-muted" />
                              </span>
                            }
                            items={[
                              {
                                label: "View details",
                                onClick: () => router.push(`/dashboard/teachers/${teacher.id}`),
                              },
                              ...(canManage
                                ? [
                                    {
                                      label: "Edit",
                                      onClick: () => void openEdit(teacher),
                                    },
                                    {
                                      label: "Reset password",
                                      onClick: () => setResetTeacher(teacher),
                                    },
                                    {
                                      label: isActive ? "Deactivate" : "Reactivate",
                                      variant: (isActive ? "danger" : "success") as "danger" | "success",
                                      dividerBefore: true,
                                      onClick: () =>
                                        isActive ? setDeactivateTeacher(teacher) : setReactivateTeacher(teacher),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between text-sm text-theme-muted">
                <p>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} teachers
                </p>
                <div className="flex gap-2">
                  <button type="button" className="ms-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ms-btn-secondary"
                    disabled={page * PAGE_SIZE >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </QueryState>

      <AddTeacherPanel open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void mutate()} />
      <EditTeacherPanel
        teacher={editTeacher}
        onClose={() => setEditTeacher(null)}
        onSaved={() => void mutate()}
      />
      <DeactivateDialog
        teacher={deactivateTeacher}
        onClose={() => setDeactivateTeacher(null)}
        onSaved={(updated) => {
          setOptimistic((prev) => ({ ...prev, [updated.id]: false }));
          void mutate();
        }}
      />
      <ReactivateDialog
        teacher={reactivateTeacher}
        onClose={() => setReactivateTeacher(null)}
        onSaved={(updated) => {
          setOptimistic((prev) => ({ ...prev, [updated.id]: true }));
          void mutate();
        }}
      />
      <ResetPasswordDialog teacher={resetTeacher} onClose={() => setResetTeacher(null)} />
    </section>
  );
}
