'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type { ALevelSubject, ALevelSubjectType } from '@makyschool/shared';
import { useApiSWR } from '@/hooks/useApiSWR';
import {
  useALevelSubjects,
  useCreateALevelSubject,
  useDeleteALevelSubject,
  useUpdateALevelSubject,
} from '@/hooks/useALevel';

/** Row from the school-wide catalogue (Academics > Subjects). */
type CatalogueSubject = { id: string; name: string };

const NEW_SUBJECT = '__new__';

type FormState = {
  schoolSubjectId: string;
  newName: string;
  code: string;
  subjectType: ALevelSubjectType;
  isGp: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  schoolSubjectId: '',
  newName: '',
  code: '',
  subjectType: 'principal',
  isGp: false,
  isActive: true,
};

export default function ALevelSubjectsPage() {
  const { data: subjects, isPending, isError, refetch } = useALevelSubjects();
  const { data: catalogue } = useApiSWR<CatalogueSubject[]>('/schools/subjects');
  const createSubject = useCreateALevelSubject();
  const updateSubject = useUpdateALevelSubject();
  const deleteSubject = useDeleteALevelSubject();

  const [editing, setEditing] = useState<ALevelSubject | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ALevelSubject | null>(null);

  // Catalogue subjects that don't have an A-Level profile yet.
  const availableCatalogue = useMemo(() => {
    const used = new Set((subjects ?? []).map((s) => s.schoolSubjectId));
    return (catalogue ?? []).filter((c) => !used.has(c.id));
  }, [catalogue, subjects]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(subject: ALevelSubject) {
    setEditing(subject);
    setForm({
      schoolSubjectId: subject.schoolSubjectId,
      newName: '',
      code: subject.code,
      subjectType: subject.subjectType,
      isGp: subject.isGp,
      isActive: subject.isActive,
    });
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    setError(null);
    try {
      if (editing) {
        await updateSubject.mutateAsync({
          id: editing.id,
          payload: {
            code: form.code.trim().toUpperCase(),
            subjectType: form.subjectType,
            isGp: form.subjectType === 'subsidiary' ? form.isGp : false,
            isActive: form.isActive,
          },
        });
      } else {
        if (!form.schoolSubjectId) {
          setError('Pick a subject from the catalogue or create a new one.');
          return;
        }
        if (form.schoolSubjectId === NEW_SUBJECT && !form.newName.trim()) {
          setError('Enter a name for the new subject.');
          return;
        }
        await createSubject.mutateAsync({
          schoolSubjectId:
            form.schoolSubjectId === NEW_SUBJECT ? null : form.schoolSubjectId,
          name: form.schoolSubjectId === NEW_SUBJECT ? form.newName.trim() : null,
          code: form.code.trim().toUpperCase(),
          subjectType: form.subjectType,
          isGp: form.subjectType === 'subsidiary' ? form.isGp : false,
          isActive: form.isActive,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save subject.');
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteSubject.mutateAsync(toDelete.id);
      setToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete subject.');
      setToDelete(null);
    }
  }

  const principals = (subjects ?? []).filter((s) => s.subjectType === 'principal');
  const subsidiaries = (subjects ?? []).filter((s) => s.subjectType === 'subsidiary');

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level subjects"
        description={
          <>
            Classify catalogue subjects as A-Level principals or subsidiaries. Subject
            names are managed in{' '}
            <Link href="/dashboard/subjects" className="font-semibold text-theme-accent hover:underline">
              Academics → Subjects
            </Link>
            .
          </>
        }
        actions={
          <button type="button" onClick={openCreate} className="ms-btn-primary">
            <Plus className="h-4 w-4" />
            Add subject
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
          title="Couldn’t load subjects"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (subjects ?? []).length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No A-Level subjects yet"
          description="Pick subjects from your catalogue and mark them as principal (e.g. Physics, Maths) or subsidiary (General Paper, Sub-ICT)."
        />
      ) : (
        <div className="space-y-8">
          <SubjectTable title="Principal subjects" subjects={principals} onEdit={openEdit} onDelete={setToDelete} />
          <SubjectTable title="Subsidiary subjects" subjects={subsidiaries} onEdit={openEdit} onDelete={setToDelete} />
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit A-Level subject' : 'Add A-Level subject'}
        description={
          editing
            ? 'The subject name is managed from Academics → Subjects.'
            : 'Pick an existing catalogue subject, or create a new one — it will also appear under Academics → Subjects.'
        }
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="ms-btn-ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={createSubject.isPending || updateSubject.isPending}
              onClick={() => void submit()}
            >
              {editing ? 'Save changes' : 'Add subject'}
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

          {editing ? (
            <div>
              <span className="mb-1 block text-sm font-medium text-theme-primary">Subject</span>
              <p className="ms-input w-full cursor-not-allowed bg-theme-raised/40 text-theme-muted">
                {editing.name}
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">Subject</span>
                <select
                  className="ms-input w-full"
                  value={form.schoolSubjectId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schoolSubjectId: e.target.value }))
                  }
                >
                  <option value="">Select from catalogue…</option>
                  {availableCatalogue.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_SUBJECT}>+ Create a new subject…</option>
                </select>
              </label>
              {form.schoolSubjectId === NEW_SUBJECT ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-theme-primary">
                    New subject name
                  </span>
                  <input
                    className="ms-input w-full"
                    value={form.newName}
                    placeholder="e.g. Physics"
                    onChange={(e) => setForm((f) => ({ ...f, newName: e.target.value }))}
                  />
                </label>
              ) : null}
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">Code</span>
            <input
              className="ms-input w-full uppercase"
              value={form.code}
              placeholder="e.g. PHY"
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">Type</span>
            <select
              className="ms-input w-full"
              value={form.subjectType}
              onChange={(e) =>
                setForm((f) => ({ ...f, subjectType: e.target.value as ALevelSubjectType }))
              }
            >
              <option value="principal">Principal</option>
              <option value="subsidiary">Subsidiary</option>
            </select>
          </label>
          {form.subjectType === 'subsidiary' ? (
            <label className="flex items-center gap-2 text-sm text-theme-primary">
              <input
                type="checkbox"
                checked={form.isGp}
                onChange={(e) => setForm((f) => ({ ...f, isGp: e.target.checked }))}
              />
              This is General Paper (GP)
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-theme-primary">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Remove A-Level profile"
        description={`Remove the A-Level profile for “${toDelete?.name}”? The subject stays in the school catalogue. Subjects used by combinations or grades cannot be removed.`}
        variant="danger"
        confirmLabel="Remove"
        loading={deleteSubject.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function SubjectTable({
  title,
  subjects,
  onEdit,
  onDelete,
}: {
  title: string;
  subjects: ALevelSubject[];
  onEdit: (s: ALevelSubject) => void;
  onDelete: (s: ALevelSubject) => void;
}) {
  if (subjects.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold text-theme-primary">{title}</h2>
        <p className="text-sm text-theme-muted">None yet.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-theme-primary">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
        <table className="ms-table w-full">
          <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
            <tr>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Flags</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-t border-theme hover:bg-theme-raised/40">
                <td className="px-4 py-3 font-mono text-sm text-theme-primary">{s.code}</td>
                <td className="px-4 py-3 text-sm text-theme-primary">{s.name}</td>
                <td className="px-4 py-3 text-xs text-theme-muted">
                  {s.isGp ? 'GP · ' : ''}
                  {s.isActive ? 'Active' : 'Inactive'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="ms-btn-ghost px-2 py-1"
                      onClick={() => onEdit(s)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="ms-btn-ghost px-2 py-1 text-theme-danger"
                      onClick={() => onDelete(s)}
                      aria-label="Delete"
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
    </section>
  );
}
