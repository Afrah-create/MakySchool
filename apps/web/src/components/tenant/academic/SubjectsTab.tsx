"use client";

import { useCallback, useState } from "react";
import type { SubjectWithDetails } from "@makyschool/shared/types";
import { Plus } from "lucide-react";
import {
  AcademicPagination,
  AcademicTableShell,
  AcademicToolbar,
  RowActions,
} from "@/components/tenant/academic/AcademicLayout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { QueryState } from "@/components/ui/QueryState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { useListControls } from "@/lib/academic/useListControls";

type SubjectsTabProps = {
  subjects: SubjectWithDetails[] | undefined;
  loading: boolean;
  isValidating?: boolean;
  error: unknown;
  onRetry?: () => void;
  actionLoading: boolean;
  onCreate: (name: string) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onDelete: (subject: SubjectWithDetails) => Promise<void>;
};

export function SubjectsTab({
  subjects,
  loading,
  isValidating = false,
  error,
  onRetry,
  actionLoading,
  onCreate,
  onUpdate,
  onDelete,
}: SubjectsTabProps) {
  const [newName, setNewName] = useState("");
  const [editingSubject, setEditingSubject] = useState<SubjectWithDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SubjectWithDetails | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await onCreate(newName.trim());
      setNewName("");
    } catch {
      // Error banner is shown by the parent.
    }
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!editingSubject || !editName.trim()) return;
    try {
      await onUpdate(editingSubject.id, editName.trim());
      setEditingSubject(null);
      setEditName("");
    } catch {
      // Keep the edit panel open on failure.
    }
  }

  return (
    <div className="space-y-4">
      <section className="ms-card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-theme-primary">Quick add</h2>
        <p className="mt-1 text-sm text-theme-muted">Subjects can be linked to classes from the Assignments tab.</p>
        <form onSubmit={(event) => void handleCreate(event)} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            placeholder="e.g. Mathematics, English"
            className="ms-input flex-1"
          />
          <LoadingButton
            type="submit"
            loading={actionLoading}
            loadingLabel="Adding…"
            className="shrink-0 rounded-xl px-4 py-2.5"
          >
            <Plus className="h-4 w-4" />
            Add subject
          </LoadingButton>
        </form>
      </section>

      <QueryState
        isLoading={loading}
        isValidating={isValidating}
        error={error}
        data={subjects}
        onRetry={onRetry}
        isEmpty={(items) => items.length === 0}
        loading={<SkeletonTable rows={6} />}
        empty={
          <EmptyState
            variant="compact"
            icon={null}
            title="No subjects yet"
            description="Add subjects above, then link them to classes."
          />
        }
        errorView={
          <EmptyState
            variant="error"
            title="Subjects unavailable"
            description="Unable to load subjects right now."
            onRetry={onRetry}
          />
        }
      >
        {(items) => <SubjectsTable items={items} onEdit={(s) => { setEditingSubject(s); setEditName(s.name); }} onDelete={setConfirmDelete} />}
      </QueryState>

      <SlideOver
        open={Boolean(editingSubject)}
        onClose={() => {
          setEditingSubject(null);
          setEditName("");
        }}
        title="Edit subject"
        description="Update the subject name."
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingSubject(null);
                setEditName("");
              }}
              className="ms-btn-ghost rounded-xl px-4 py-2"
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              form="edit-subject-form"
              loading={actionLoading}
              loadingLabel="Saving…"
              className="rounded-xl px-4 py-2"
            >
              Save changes
            </LoadingButton>
          </div>
        }
      >
        <form id="edit-subject-form" onSubmit={(event) => void handleUpdate(event)}>
          <label htmlFor="edit-subject-name" className="mb-1.5 block text-sm font-medium text-theme-primary">
            Subject name
          </label>
          <input
            id="edit-subject-name"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            required
            className="ms-input w-full"
          />
        </form>
      </SlideOver>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete && confirmDelete.class_count > 0
            ? "Cannot delete subject"
            : "Delete subject"
        }
        description={
          confirmDelete
            ? confirmDelete.class_count > 0
              ? `Cannot delete ${confirmDelete.name}. It is linked to ${confirmDelete.class_count} class${confirmDelete.class_count === 1 ? "" : "es"}. Unlink it first.`
              : `Delete ${confirmDelete.name}? This cannot be undone.`
            : ""
        }
        variant={confirmDelete && confirmDelete.class_count > 0 ? "blocked" : "danger"}
        confirmLabel="Delete subject"
        loading={confirmLoading}
        onConfirm={() => {
          if (!confirmDelete || confirmDelete.class_count > 0) {
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
        {confirmDelete && confirmDelete.class_count > 0 ? (
          <p className="alert-error rounded-lg px-3 py-2 text-sm">
            Remove this subject from all classes before deleting it.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function SubjectsTable({
  items,
  onEdit,
  onDelete,
}: {
  items: SubjectWithDetails[];
  onEdit: (subject: SubjectWithDetails) => void;
  onDelete: (subject: SubjectWithDetails) => void;
}) {
  const filterFn = useCallback(
    (subject: SubjectWithDetails, query: string) =>
      !query || subject.name.toLowerCase().includes(query),
    [],
  );

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
  } = useListControls({ items, pageSize: 20, filterFn });

  return (
    <AcademicTableShell
      toolbar={
        <AcademicToolbar
          searchPlaceholder="Search subjects…"
          searchValue={query}
          onSearchChange={setQuery}
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
          <EmptyState variant="compact" icon={null} title="No matching subjects" description="Try a different search term." />
        </div>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-table-header text-xs uppercase tracking-wide text-theme-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Classes linked</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme">
            {paged.map((subject) => (
              <tr key={subject.id} className="transition hover:bg-table-row-hover">
                <td className="px-5 py-3.5 font-medium text-theme-primary">{subject.name}</td>
                <td className="px-5 py-3.5 tabular-nums text-theme-muted">
                  {subject.class_count} class{subject.class_count === 1 ? "" : "es"}
                </td>
                <td className="px-5 py-3.5">
                  <RowActions onEdit={() => onEdit(subject)} onDelete={() => onDelete(subject)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AcademicTableShell>
  );
}
