"use client";

import { useCallback, useMemo, useState } from "react";
import {
  formatClassLabel,
  getLevelsForSchoolType,
  sortClasses,
} from "@makyschool/shared/constants";
import type { ClassWithDetails, SchoolType } from "@makyschool/shared/types";
import { Plus } from "lucide-react";
import {
  AcademicFilterSelect,
  AcademicPagination,
  AcademicTableShell,
  AcademicToolbar,
  RowActions,
} from "@/components/tenant/academic/AcademicLayout";
import { ClassFormSlideOver } from "@/components/tenant/academic/ClassFormSlideOver";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useListControls } from "@/lib/academic/useListControls";

type ClassStatus = "all" | "active" | "needs_subjects" | "at_capacity";

function classStatus(classRow: ClassWithDetails) {
  if (classRow.capacity != null && classRow.student_count >= classRow.capacity) {
    return "at_capacity" as const;
  }
  if (classRow.subjects.length === 0) {
    return "needs_subjects" as const;
  }
  return "active" as const;
}

function statusBadge(classRow: ClassWithDetails) {
  const status = classStatus(classRow);
  if (status === "at_capacity") {
    return { label: "At capacity", tone: "warning" as const };
  }
  if (status === "needs_subjects") {
    return { label: "Needs subjects", tone: "danger" as const };
  }
  return { label: "Active", tone: "success" as const };
}

type ClassesTabProps = {
  schoolType: SchoolType | null;
  classes: ClassWithDetails[] | undefined;
  loading: boolean;
  isValidating?: boolean;
  error: unknown;
  onRetry?: () => void;
  actionLoading: boolean;
  onCreate: (values: { level: string; stream: string | null; capacity: number | null }) => Promise<void>;
  onUpdate: (
    id: string,
    values: { level: string; stream: string | null; capacity: number | null },
  ) => Promise<void>;
  onDelete: (classRow: ClassWithDetails) => Promise<void>;
};

export function ClassesTab({
  schoolType,
  classes,
  loading,
  isValidating = false,
  error,
  onRetry,
  actionLoading,
  onCreate,
  onUpdate,
  onDelete,
}: ClassesTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClassWithDetails | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ClassStatus>("all");

  const levelOptions = useMemo(() => {
    const levels = getLevelsForSchoolType(schoolType);
    return [
      { value: "all", label: "All levels" },
      ...levels.map((level) => ({ value: level, label: level })),
    ];
  }, [schoolType]);

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "needs_subjects", label: "Needs subjects" },
    { value: "at_capacity", label: "At capacity" },
  ];

  const filterFn = useCallback(
    (classRow: ClassWithDetails, query: string) => {
      const label = formatClassLabel(classRow.level, classRow.stream).toLowerCase();
      const matchesQuery =
        !query ||
        label.includes(query) ||
        classRow.level.toLowerCase().includes(query) ||
        (classRow.stream ?? "").toLowerCase().includes(query);

      const matchesLevel = levelFilter === "all" || classRow.level === levelFilter;
      const matchesStatus =
        statusFilter === "all" || classStatus(classRow) === statusFilter;

      return matchesQuery && matchesLevel && matchesStatus;
    },
    [levelFilter, statusFilter],
  );

  function openCreate() {
    setEditingClass(null);
    setFormOpen(true);
  }

  function openEdit(classRow: ClassWithDetails) {
    setEditingClass(classRow);
    setFormOpen(true);
  }

  async function handleSubmit(values: {
    level: string;
    stream: string | null;
    capacity: number | null;
  }) {
    try {
      if (editingClass) {
        await onUpdate(editingClass.id, values);
      } else {
        await onCreate(values);
      }
      setFormOpen(false);
      setEditingClass(null);
    } catch {
      // Keep the form open so the user can fix validation errors.
    }
  }

  return (
    <>
      <QueryState
        isLoading={loading}
        isValidating={isValidating}
        error={error}
        data={classes}
        onRetry={onRetry}
        isEmpty={(items) => items.length === 0}
        loading={<SkeletonTable rows={8} />}
        empty={
          <EmptyState
            variant="compact"
            icon={null}
            title="No classes yet"
            description="Add your first class to start building your academic structure."
            action={
              <button type="button" onClick={openCreate} className="ms-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
                <Plus className="h-4 w-4" />
                Add class
              </button>
            }
          />
        }
        errorView={
          <EmptyState
            variant="error"
            title="Classes unavailable"
            description="Unable to load the class list right now."
            onRetry={onRetry}
          />
        }
      >
        {(items) => (
          <ClassesTable
            items={sortClasses(items, schoolType)}
            levelFilter={levelFilter}
            statusFilter={statusFilter}
            levelOptions={levelOptions}
            statusOptions={statusOptions}
            onLevelFilterChange={setLevelFilter}
            onStatusFilterChange={(value) => setStatusFilter(value as ClassStatus)}
            filterFn={filterFn}
            onAdd={openCreate}
            onEdit={openEdit}
            onDelete={setConfirmDelete}
          />
        )}
      </QueryState>

      <ClassFormSlideOver
        open={formOpen}
        schoolType={schoolType}
        initial={editingClass}
        loading={actionLoading}
        onClose={() => {
          setFormOpen(false);
          setEditingClass(null);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete && confirmDelete.student_count > 0 ? "Cannot delete class" : "Delete class"
        }
        description={
          confirmDelete
            ? confirmDelete.student_count > 0
              ? `Cannot delete ${formatClassLabel(confirmDelete.level, confirmDelete.stream)}. ${confirmDelete.student_count} student${confirmDelete.student_count === 1 ? "" : "s"} are currently enrolled. Please move them first.`
              : `Delete ${formatClassLabel(confirmDelete.level, confirmDelete.stream)}? This cannot be undone.`
            : ""
        }
        variant={confirmDelete && confirmDelete.student_count > 0 ? "blocked" : "danger"}
        confirmLabel="Delete class"
        loading={confirmLoading}
        onConfirm={() => {
          if (!confirmDelete || confirmDelete.student_count > 0) {
            return;
          }

          setConfirmLoading(true);
          void onDelete(confirmDelete)
            .then(() => setConfirmDelete(null))
            .catch(() => {})
            .finally(() => setConfirmLoading(false));
        }}
        onCancel={() => {
          if (!confirmLoading) {
            setConfirmDelete(null);
          }
        }}
      >
        {confirmDelete && confirmDelete.student_count > 0 ? (
          <p className="alert-error rounded-lg px-3 py-2 text-sm">
            This class cannot be deleted until all students are moved out.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function ClassesTable({
  items,
  levelFilter,
  statusFilter,
  levelOptions,
  statusOptions,
  onLevelFilterChange,
  onStatusFilterChange,
  filterFn,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: ClassWithDetails[];
  levelFilter: string;
  statusFilter: ClassStatus;
  levelOptions: Array<{ value: string; label: string }>;
  statusOptions: Array<{ value: string; label: string }>;
  onLevelFilterChange: (value: string) => void;
  onStatusFilterChange: (value: ClassStatus) => void;
  filterFn: (item: ClassWithDetails, query: string) => boolean;
  onAdd: () => void;
  onEdit: (row: ClassWithDetails) => void;
  onDelete: (row: ClassWithDetails) => void;
}) {
  const {
    query,
    setQuery,
    page,
    setPage,
    totalPages,
    paged,
    filteredCount,
    rangeStart,
    rangeEnd,
  } = useListControls({ items, pageSize: 20, filterFn, resetDeps: [levelFilter, statusFilter] });

  return (
    <AcademicTableShell
      toolbar={
        <AcademicToolbar
          searchPlaceholder="Search class or stream…"
          searchValue={query}
          onSearchChange={setQuery}
          filters={
            <>
              <AcademicFilterSelect
                label="Filter by level"
                value={levelFilter}
                onChange={onLevelFilterChange}
                options={levelOptions}
              />
              <AcademicFilterSelect
                label="Filter by status"
                value={statusFilter}
                onChange={(value) => onStatusFilterChange(value as ClassStatus)}
                options={statusOptions}
              />
            </>
          }
          actions={
            <button type="button" onClick={onAdd} className="ms-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
              <Plus className="h-4 w-4" />
              Add class
            </button>
          }
        />
      }
      footer={
        <AcademicPagination
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={filteredCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
    >
      {filteredCount === 0 ? (
        <div className="px-5 py-12">
          <EmptyState
            variant="compact"
            icon={null}
            title="No matching classes"
            description="Try adjusting your search or filters."
          />
        </div>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-table-header text-xs uppercase tracking-wide text-theme-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="hidden px-5 py-3 font-medium sm:table-cell">Level</th>
              <th className="hidden px-5 py-3 font-medium md:table-cell">Stream</th>
              <th className="px-5 py-3 font-medium">Students</th>
              <th className="hidden px-5 py-3 font-medium lg:table-cell">Subjects</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme">
            {paged.map((classRow) => {
              const label = formatClassLabel(classRow.level, classRow.stream);
              const status = statusBadge(classRow);
              const fillPercent =
                classRow.capacity != null && classRow.capacity > 0
                  ? Math.min(100, Math.round((classRow.student_count / classRow.capacity) * 100))
                  : null;

              return (
                <tr key={classRow.id} className="transition hover:bg-table-row-hover">
                  <td className="px-5 py-3.5 font-medium text-theme-primary">{label}</td>
                  <td className="hidden px-5 py-3.5 text-theme-muted sm:table-cell">{classRow.level}</td>
                  <td className="hidden px-5 py-3.5 text-theme-muted md:table-cell">
                    {classRow.stream ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="min-w-[5rem]">
                      <span className="tabular-nums text-theme-primary">
                        {classRow.student_count}
                        {classRow.capacity != null ? ` / ${classRow.capacity}` : ""}
                      </span>
                      {fillPercent != null ? (
                        <div className="mt-1.5 h-1 w-full max-w-[6rem] overflow-hidden rounded-full bg-theme-icon/40">
                          <div
                            className={`h-full rounded-full ${fillPercent >= 100 ? "bg-amber-500" : "bg-theme-accent"}`}
                            style={{ width: `${fillPercent}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 tabular-nums text-theme-muted lg:table-cell">
                    {classRow.subjects.length}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <RowActions
                      onEdit={() => onEdit(classRow)}
                      onDelete={() => onDelete(classRow)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </AcademicTableShell>
  );
}
