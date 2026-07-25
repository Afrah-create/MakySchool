'use client';

import { useState } from 'react';
import { Pencil, Plus, Sigma, Trash2 } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type {
  ALevelCombination,
  ALevelCombinationCategory,
} from '@makyschool/shared';
import { useToast } from '@/providers/ToastProvider';
import {
  useALevelCombinations,
  useALevelSubjects,
  useCreateALevelCombination,
  useDeleteALevelCombination,
  useUpdateALevelCombination,
} from '@/hooks/useALevel';

const CATEGORIES: ALevelCombinationCategory[] = [
  'science',
  'arts',
  'business',
  'technical',
];

type FormState = {
  name: string;
  label: string;
  category: ALevelCombinationCategory;
  subjectIds: string[];
};

const EMPTY_FORM: FormState = {
  name: '',
  label: '',
  category: 'science',
  subjectIds: [],
};

export default function ALevelCombinationsPage() {
  const { toast } = useToast();
  const {
    data: combinations,
    isPending,
    isError,
    refetch,
  } = useALevelCombinations();
  const { data: subjects } = useALevelSubjects();
  const createCombination = useCreateALevelCombination();
  const updateCombination = useUpdateALevelCombination();
  const deleteCombination = useDeleteALevelCombination();

  const principals = (subjects ?? []).filter(
    (s) => s.subjectType === 'principal' && s.isActive,
  );

  const [editing, setEditing] = useState<ALevelCombination | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ALevelCombination | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(combo: ALevelCombination) {
    setEditing(combo);
    setForm({
      name: combo.name,
      label: combo.label ?? '',
      category: combo.category,
      subjectIds: combo.subjects.map((s) => s.id),
    });
    setError(null);
    setFormOpen(true);
  }

  function toggleSubject(id: string) {
    setForm((f) => {
      if (f.subjectIds.includes(id)) {
        return { ...f, subjectIds: f.subjectIds.filter((x) => x !== id) };
      }
      if (f.subjectIds.length >= 3) return f;
      return { ...f, subjectIds: [...f.subjectIds, id] };
    });
  }

  async function submit() {
    setError(null);
    if (form.subjectIds.length !== 3) {
      setError('Select exactly 3 principal subjects.');
      return;
    }
    try {
      const payload = {
        name: form.name.trim().toUpperCase(),
        label: form.label.trim() || null,
        category: form.category,
        subjectIds: form.subjectIds,
      };
      if (editing) {
        await updateCombination.mutateAsync({ id: editing.id, payload });
        toast.success(`${payload.name} updated.`);
      } else {
        await createCombination.mutateAsync(payload);
        toast.success(`${payload.name} created.`);
      }
      setFormOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save combination.';
      setError(message);
      toast.error(message);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const name = toDelete.name;
    try {
      await deleteCombination.mutateAsync(toDelete.id);
      toast.success(`${name} deleted.`);
      setToDelete(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not delete combination.',
      );
      setToDelete(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level combinations"
        description="Each combination is exactly 3 principal subjects (e.g. PCM, HEG)."
        actions={
          <button type="button" onClick={openCreate} className="ms-btn-primary">
            <Plus className="h-4 w-4" />
            Add combination
          </button>
        }
      />

      {error && !formOpen ? (
        <div className="rounded-xl border border-theme bg-theme-danger-bg/50 px-4 py-3 text-sm text-theme-danger">
          {error}
        </div>
      ) : null}

      {isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load combinations"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (combinations ?? []).length === 0 ? (
        <EmptyState
          icon={Sigma}
          title="No combinations yet"
          description="Create your subject combinations after adding principal subjects."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(combinations ?? []).map((combo) => (
            <div
              key={combo.id}
              className="rounded-xl border border-theme bg-theme-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-theme-primary">
                      {combo.name}
                    </h3>
                    <span className="rounded-full bg-theme-accent-muted px-2 py-0.5 text-[11px] font-medium capitalize text-theme-accent">
                      {combo.category}
                    </span>
                  </div>
                  {combo.label ? (
                    <p className="text-xs text-theme-muted">{combo.label}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="ms-btn-ghost px-2 py-1"
                    onClick={() => openEdit(combo)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="ms-btn-ghost px-2 py-1 text-theme-danger"
                    onClick={() => setToDelete(combo)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {combo.subjects.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-full border border-theme bg-theme-raised/40 px-2.5 py-1 text-xs text-theme-primary"
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit combination' : 'Add combination'}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="ms-btn-ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={createCombination.isPending || updateCombination.isPending}
              onClick={() => void submit()}
            >
              {editing ? 'Save changes' : 'Add combination'}
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-theme bg-theme-danger-bg/50 px-3 py-2 text-sm text-theme-danger">
              {error}
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">Name / code</span>
            <input
              className="ms-input w-full uppercase"
              value={form.name}
              placeholder="e.g. PCM"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Label (optional)
            </span>
            <input
              className="ms-input w-full"
              value={form.label}
              placeholder="e.g. Physics, Chemistry, Maths"
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">Category</span>
            <select
              className="ms-input w-full capitalize"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as ALevelCombinationCategory,
                }))
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Principal subjects ({form.subjectIds.length}/3)
            </span>
            {principals.length === 0 ? (
              <p className="text-sm text-theme-muted">
                Add principal subjects first.
              </p>
            ) : (
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {principals.map((s) => {
                  const selected = form.subjectIds.includes(s.id);
                  const disabled = !selected && form.subjectIds.length >= 3;
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        selected
                          ? 'border-theme-accent bg-theme-accent-muted text-theme-primary'
                          : 'border-theme text-theme-muted'
                      } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleSubject(s.id)}
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete combination"
        description={`Delete “${toDelete?.name}”? Combinations with enrolled students cannot be deleted.`}
        variant="danger"
        confirmLabel="Delete"
        loading={deleteCombination.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
