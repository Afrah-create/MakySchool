'use client';

import { useState } from 'react';
import { ListOrdered, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type { ALevelExamType } from '@makyschool/shared';
import { useToast } from '@/providers/ToastProvider';
import {
  useALevelExamTypes,
  useCreateALevelExamType,
  useDeleteALevelExamType,
  useUpdateALevelExamType,
} from '@/hooks/useALevel';

export default function ALevelExamTypesPage() {
  const { toast } = useToast();
  const { data, isPending, isError, refetch } = useALevelExamTypes(true);
  const createType = useCreateALevelExamType();
  const updateType = useUpdateALevelExamType();
  const deleteType = useDeleteALevelExamType();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ALevelExamType | null>(null);
  const [toDelete, setToDelete] = useState<ALevelExamType | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  function openCreate() {
    setEditing(null);
    setName('');
    setCode('');
    setSortOrder((data?.length ?? 0) + 1);
    setIsActive(true);
    setFormOpen(true);
  }

  function openEdit(t: ALevelExamType) {
    setEditing(t);
    setName(t.name);
    setCode(t.code);
    setSortOrder(t.sortOrder);
    setIsActive(t.isActive);
    setFormOpen(true);
  }

  async function submit() {
    if (!name.trim() || !code.trim()) {
      toast.error('Name and code are required.');
      return;
    }
    try {
      if (editing) {
        await updateType.mutateAsync({
          id: editing.id,
          payload: {
            name: name.trim(),
            code: code.trim().toUpperCase(),
            sortOrder,
            isActive,
          },
        });
        toast.success('Exam type updated.');
      } else {
        await createType.mutateAsync({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          sortOrder,
          isActive,
        });
        toast.success('Exam type created.');
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save exam type.',
      );
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteType.mutateAsync(toDelete.id);
      toast.success(`${toDelete.name} deleted.`);
      setToDelete(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not delete exam type.',
      );
      setToDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Exam types"
        description="Reusable labels for exams in a term — Beginning of Term, Mid Term, End of Term, and any custom types."
        actions={
          <button type="button" className="ms-btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add type
          </button>
        }
      />

      {isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load exam types"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No exam types"
          description="Add types like Mid Term and End of Term, then create exams for each class."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <table className="ms-table w-full">
            <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-center">Order</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-theme">
                  <td className="px-4 py-3 font-medium text-theme-primary">
                    {t.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-theme-muted">
                    {t.code}
                  </td>
                  <td className="px-4 py-3 text-center text-theme-muted">
                    {t.sortOrder}
                  </td>
                  <td className="px-4 py-3 text-center text-theme-muted">
                    {t.isActive ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="ms-btn-ghost px-2 py-1 text-xs"
                        onClick={() => openEdit(t)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ms-btn-ghost px-2 py-1 text-theme-danger"
                        onClick={() => setToDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit exam type' : 'Add exam type'}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="ms-btn-ghost"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={createType.isPending || updateType.isPending}
              onClick={() => void submit()}
            >
              Save
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              className="ms-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mid Term"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Code</span>
            <input
              className="ms-input w-full uppercase"
              value={code}
              maxLength={12}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MID"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Sort order</span>
            <input
              type="number"
              className="ms-input w-full"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete exam type"
        description={`Delete ${toDelete?.name}? Types used by existing exams cannot be removed.`}
        variant="danger"
        confirmLabel="Delete"
        loading={deleteType.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
