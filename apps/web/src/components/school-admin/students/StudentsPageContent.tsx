"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, MoreHorizontal, Plus, Upload } from "lucide-react";
import {
  PRIMARY_CLASS_LEVELS,
  SECONDARY_CLASS_LEVELS,
  formatClassLabel,
} from "@makyschool/shared/constants";
import { CanDo } from "@/components/ui/CanDo";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { AddStudentPanel } from "@/components/school-admin/students/AddStudentPanel";
import { EditStudentPanel } from "@/components/school-admin/students/EditStudentPanel";
import { ImportStudentsPanel } from "@/components/school-admin/students/ImportStudentsPanel";
import { PromoteClassDialog } from "@/components/school-admin/students/PromoteClassDialog";
import { ReinstateStudentDialog } from "@/components/school-admin/students/ReinstateStudentDialog";
import { StudentTableSkeleton } from "@/components/school-admin/students/StudentRowSkeleton";
import { TransferClassDialog } from "@/components/school-admin/students/TransferClassDialog";
import { WithdrawStudentDialog } from "@/components/school-admin/students/WithdrawStudentDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { DataTable } from "@makyschool/ui/components/ui/DataTable";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { FilterField } from "@makyschool/ui/components/ui/FilterField";
import { FilterSegment } from "@makyschool/ui/components/ui/FilterSegment";
import { ListToolbar } from "@makyschool/ui/components/ui/ListToolbar";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useCan } from "@/hooks/useCurrentRole";
import { apiClient } from "@/lib/api/client";
import type { ClassOption, StudentDetail, StudentListItem, StudentsListResponse } from "@/lib/students/types";
import {
  capitalizeGender,
  formatDobWithAge,
  studentInitials,
} from "@/lib/validation/students";

const PAGE_SIZE = 25;

function groupClasses(classes: ClassOption[]) {
  const primary = classes.filter((item) =>
    (PRIMARY_CLASS_LEVELS as readonly string[]).includes(item.level),
  );
  const secondary = classes.filter((item) =>
    (SECONDARY_CLASS_LEVELS as readonly string[]).includes(item.level),
  );
  return [
    { label: "Primary", items: primary },
    { label: "Secondary", items: secondary },
  ].filter((group) => group.items.length > 0);
}

export function StudentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManage = useCan("manageStaff");

  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState<"active" | "withdrawn">("active");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentDetail | null>(null);
  const [transferStudent, setTransferStudent] = useState<StudentListItem | null>(null);
  const [withdrawStudent, setWithdrawStudent] = useState<StudentListItem | null>(null);
  const [reinstateStudent, setReinstateStudent] = useState<StudentListItem | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    params.set("status", status);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (classId) params.set("class_id", classId);
    if (gender) params.set("gender", gender);
    return `/schools/students?${params.toString()}`;
  }, [page, debouncedSearch, classId, gender, status]);

  const { data, error, isLoading, mutate } = useApiSWR<StudentsListResponse>(query);
  const { data: classes = [] } = useApiSWR<ClassOption[]>("/schools/classes");
  const { data: activeStats } = useApiSWR<StudentsListResponse>(
    "/schools/students?status=active&limit=1",
  );
  const { data: withdrawnStats } = useApiSWR<StudentsListResponse>(
    "/schools/students?status=withdrawn&limit=1",
  );

  const students = data?.students ?? [];
  const total = data?.total ?? 0;
  const hasFilters = Boolean(debouncedSearch || classId || gender || status !== "active");
  const classGroups = useMemo(() => groupClasses(classes), [classes]);
  const distinctClasses = new Set(classes.map((item) => item.id)).size;

  useEffect(() => {
    if (!canManage) return;
    if (searchParams.get("add") === "1") {
      setAddOpen(true);
      router.replace("/dashboard/students", { scroll: false });
    }
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      router.replace("/dashboard/students", { scroll: false });
    }
  }, [searchParams, canManage, router]);

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  async function openEdit(student: StudentListItem) {
    const response = await apiClient<StudentDetail>(`/schools/students/${student.id}`);
    setEditStudent(response.data);
  }

  function clearFilters() {
    setSearch("");
    setClassId("");
    setGender("");
    setStatus("active");
    setPage(1);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Students"
        description={
          <>
            Register and manage enrolled students.{" "}
            <span className="text-theme-muted">
              {activeStats?.total ?? 0} active · {distinctClasses} classes · {withdrawnStats?.total ?? 0}{" "}
              withdrawn
            </span>
          </>
        }
        actions={
          <CanDo action="manageStaff">
            <button
              type="button"
              className="ms-btn-secondary inline-flex items-center gap-2"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
            <button
              type="button"
              className="ms-btn-primary inline-flex items-center gap-2"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add student
            </button>
          </CanDo>
        }
      />

      <DataListPanel
        toolbar={
          <ListToolbar
            searchValue={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search by name or learner ID"
            actions={
              canManage ? (
                <button type="button" className="ms-btn-secondary" onClick={() => setPromoteOpen(true)}>
                  Promote class
                </button>
              ) : null
            }
            filters={
              <>
                <FilterField label="Class">
                  <select
                    className="ms-input ms-input-compact ms-filter-select"
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All classes</option>
                    {classGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {formatClassLabel(item.level, item.stream)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Gender">
                  <select
                    className="ms-input ms-input-compact ms-filter-select"
                    value={gender}
                    onChange={(e) => {
                      setGender(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All genders</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </FilterField>
                <FilterField label="Status" className="sm:col-span-2 lg:col-span-1">
                  <FilterSegment
                    value={status}
                    onChange={(value) => {
                      setStatus(value);
                      setPage(1);
                    }}
                    aria-label="Filter by enrollment status"
                    options={[
                      { value: "active", label: "Active" },
                      { value: "withdrawn", label: "Withdrawn" },
                    ]}
                  />
                </FilterField>
              </>
            }
          />
        }
        footer={
          total > PAGE_SIZE ? (
            <TablePagination
              summary={`Showing ${rangeStart}–${rangeEnd} of ${total} students`}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
              previousDisabled={page <= 1}
              nextDisabled={rangeEnd >= total}
            />
          ) : null
        }
      >
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<StudentTableSkeleton rows={8} embedded />}
          isEmpty={(list) => list.students.length === 0}
          empty={
            hasFilters ? (
              <div className="px-4 py-12 sm:px-5">
                <EmptyState
                  title="No students match your filters"
                  description="Try adjusting your search or filter criteria."
                  action={
                    <button
                      type="button"
                      className="text-sm text-theme-accent hover:underline"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="px-4 py-12 sm:px-5">
                <EmptyState
                  icon={GraduationCap}
                  title="No students registered yet"
                  description="Register your first student or import from a CSV file."
                  action={
                    canManage ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                          Add student
                        </button>
                        <button type="button" className="ms-btn-secondary" onClick={() => setImportOpen(true)}>
                          Import CSV
                        </button>
                      </div>
                    ) : null
                  }
                />
              </div>
            )
          }
        >
          {() => (
            <DataTable embedded minWidth="48rem">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th className="hidden sm:table-cell">DOB / Age</th>
                  <th className="hidden md:table-cell">Gender</th>
                  <th className="hidden lg:table-cell">Guardian</th>
                  <th>Status</th>
                  <th className="w-16 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const isActive = student.status === "active";
                  return (
                    <tr key={student.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {student.photo_url ? (
                            <img
                              src={student.photo_url}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-sm font-semibold text-theme-accent">
                              {studentInitials(student.full_name)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-theme-primary">{student.full_name}</p>
                            <p className="truncate text-xs text-theme-muted">{student.learner_id}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {student.class_name ? (
                          <span className="rounded-full bg-theme-raised px-2.5 py-0.5 text-xs font-medium text-theme-primary">
                            {student.class_name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="hidden text-muted sm:table-cell">
                        {formatDobWithAge(student.date_of_birth)}
                      </td>
                      <td className="hidden md:table-cell">{capitalizeGender(student.gender)}</td>
                      <td className="hidden lg:table-cell">
                        <p className="text-sm">{student.guardian_name ?? "—"}</p>
                        {student.guardian_phone ? (
                          <p className="text-xs text-theme-muted">{student.guardian_phone}</p>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isActive ? "badge-success" : "badge-danger"
                          }`}
                        >
                          {isActive ? "Active" : "Withdrawn"}
                        </span>
                      </td>
                      <td className="text-right">
                        <DropdownMenu
                          trigger={
                            <span className="inline-flex rounded-lg p-2 hover:bg-theme-raised">
                              <MoreHorizontal className="h-4 w-4 text-theme-muted" />
                            </span>
                          }
                          items={[
                            {
                              label: "View profile",
                              onClick: () => router.push(`/dashboard/students/${student.id}`),
                            },
                            ...(canManage
                              ? [
                                  {
                                    label: "Edit details",
                                    onClick: () => void openEdit(student),
                                  },
                                  {
                                    label: "Transfer class",
                                    onClick: () => setTransferStudent(student),
                                  },
                                  {
                                    label: isActive ? "Withdraw student" : "Reinstate",
                                    variant: (isActive ? "danger" : "success") as "danger" | "success",
                                    dividerBefore: true,
                                    onClick: () => {
                                      if (isActive) {
                                        setWithdrawStudent(student);
                                      } else {
                                        setReinstateStudent(student);
                                      }
                                    },
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
            </DataTable>
          )}
        </QueryState>
      </DataListPanel>

      <AddStudentPanel open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void mutate()} />
      <ImportStudentsPanel open={importOpen} onClose={() => setImportOpen(false)} onSaved={() => void mutate()} />
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
      <PromoteClassDialog open={promoteOpen} onClose={() => setPromoteOpen(false)} onSaved={() => void mutate()} />
    </section>
  );
}
