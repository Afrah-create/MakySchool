'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type { ALevelExam, ALevelExamStatus } from '@makyschool/shared';
import { useToast } from '@/providers/ToastProvider';
import { useCan } from '@/hooks/useCurrentRole';
import {
  useALevelClasses,
  useALevelExamTypes,
  useALevelExams,
  useALevelTerms,
  useCloseALevelExam,
  useCreateALevelExam,
  useDeleteALevelExam,
  useOpenALevelExam,
  useUpdateALevelExam,
} from '@/hooks/useALevel';
import { formatALevelClass } from '@/components/alevel/ClassTermPicker';

const STATUS_LABEL: Record<ALevelExamStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
};

export default function ALevelExamsPage() {
  const { toast } = useToast();
  const canManage = useCan('manageALevel');
  const canView = useCan('viewALevel');

  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();
  const { data: examTypes } = useALevelExamTypes(false);

  const years = useMemo(() => {
    const map = new Map<string, { id: string; year: number; isCurrent: boolean }>();
    for (const t of terms ?? []) {
      if (!map.has(t.academicYearId)) {
        map.set(t.academicYearId, {
          id: t.academicYearId,
          year: t.year,
          isCurrent: t.yearIsCurrent,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.year - a.year);
  }, [terms]);

  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ALevelExamStatus | ''>('');

  const effectiveYear =
    academicYearId || years.find((y) => y.isCurrent)?.id || years[0]?.id || '';

  const filteredTerms = (terms ?? []).filter(
    (t) => t.academicYearId === effectiveYear,
  );

  const { data: exams, isPending, isError, refetch } = useALevelExams(
    {
      academicYearId: effectiveYear || undefined,
      classId: classId || undefined,
      termId: termId || undefined,
      status: statusFilter || undefined,
    },
    !!effectiveYear,
  );

  const createExam = useCreateALevelExam();
  const updateExam = useUpdateALevelExam();
  const deleteExam = useDeleteALevelExam();
  const openExam = useOpenALevelExam();
  const closeExam = useCloseALevelExam();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ALevelExam | null>(null);
  const [toDelete, setToDelete] = useState<ALevelExam | null>(null);

  const [fClassId, setFClassId] = useState('');
  const [fTermId, setFTermId] = useState('');
  const [fTypeId, setFTypeId] = useState('');
  const [fName, setFName] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fOpenNow, setFOpenNow] = useState(true);

  function openCreate() {
    setEditing(null);
    setFClassId(classId);
    setFTermId(termId || filteredTerms.find((t) => t.isCurrent)?.id || '');
    setFTypeId(examTypes?.[0]?.id ?? '');
    setFName('');
    setFNotes('');
    setFOpenNow(true);
    setFormOpen(true);
  }

  function openEdit(exam: ALevelExam) {
    setEditing(exam);
    setFName(exam.name);
    setFNotes(exam.notes ?? '');
    setFormOpen(true);
  }

  async function submitForm() {
    try {
      if (editing) {
        await updateExam.mutateAsync({
          id: editing.id,
          payload: { name: fName.trim(), notes: fNotes.trim() || null },
        });
        toast.success('Exam updated.');
      } else {
        if (!fClassId || !fTermId || !fTypeId || !effectiveYear) {
          toast.error('Select class, term, and exam type.');
          return;
        }
        const created = await createExam.mutateAsync({
          classId: fClassId,
          termId: fTermId,
          academicYearId: effectiveYear,
          examTypeId: fTypeId,
          name: fName.trim() || null,
          notes: fNotes.trim() || null,
          openNow: fOpenNow,
        });
        toast.success(
          created.status === 'open'
            ? `${created.name} created and opened for marking.`
            : `${created.name} created as draft.`,
        );
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save exam.');
    }
  }

  async function toggleStatus(exam: ALevelExam) {
    try {
      if (exam.status === 'open') {
        await closeExam.mutateAsync(exam.id);
        toast.success(`${exam.name} closed.`);
      } else {
        await openExam.mutateAsync(exam.id);
        toast.success(`${exam.name} opened for marking.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not update exam status.',
      );
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteExam.mutateAsync(toDelete.id);
      toast.success(`${toDelete.name} deleted.`);
      setToDelete(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not delete exam.',
      );
      setToDelete(null);
    }
  }

  const formBusy = createExam.isPending || updateExam.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level exams"
        description="Create exams per class and term (Beginning, Mid, End of Term, …). Open for marking, close when teachers finish."
        actions={
          canManage ? (
            <button type="button" className="ms-btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create exam
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Year
          </span>
          <select
            className="ms-input"
            value={effectiveYear}
            onChange={(e) => {
              setAcademicYearId(e.target.value);
              setTermId('');
            }}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year}
                {y.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Class
          </span>
          <select
            className="ms-input"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {formatALevelClass(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Term
          </span>
          <select
            className="ms-input"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">All terms</option>
            {filteredTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            Status
          </span>
          <select
            className="ms-input"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ALevelExamStatus | '')
            }
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>

      {isPending ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load exams"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (exams ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No exams yet"
          description="Create an exam for a class and term so teachers can enter marks."
          action={
            canManage ? (
              <button type="button" className="ms-btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create exam
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="overflow-x-auto">
            <table className="ms-table w-full min-w-[48rem]">
              <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Exam</th>
                  <th className="px-4 py-3 text-left">Class</th>
                  <th className="px-4 py-3 text-left">Term</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Progress</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(exams ?? []).map((exam) => {
                  const graded = exam.gradedCells ?? 0;
                  const applicable = exam.applicableCells ?? 0;
                  const canOpen =
                    (exam.status === 'draft' && canView) ||
                    (exam.status === 'closed' && canManage);
                  const canClose = exam.status === 'open' && canView;
                  return (
                    <tr
                      key={exam.id}
                      className="border-t border-theme hover:bg-theme-raised/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-theme-primary">{exam.name}</p>
                        <p className="text-[11px] text-theme-muted">
                          {exam.examTypeName}
                          {exam.examTypeCode ? ` · ${exam.examTypeCode}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-theme-muted">
                        {exam.className}
                      </td>
                      <td className="px-4 py-3 text-sm text-theme-muted">
                        {exam.termName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            exam.status === 'open'
                              ? 'bg-theme-success-bg text-theme-success'
                              : exam.status === 'closed'
                                ? 'bg-theme-danger-bg text-theme-danger'
                                : 'bg-theme-raised text-theme-muted'
                          }`}
                        >
                          {STATUS_LABEL[exam.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-theme-muted">
                        {graded}/{applicable}
                        <span className="block text-[10px]">
                          {exam.studentCount ?? 0} students
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link
                            href={`/dashboard/alevel/grades?examId=${exam.id}`}
                            className="ms-btn-ghost px-2 py-1 text-xs"
                          >
                            Grades
                          </Link>
                          {canClose || canOpen ? (
                            <button
                              type="button"
                              className="ms-btn-ghost px-2 py-1"
                              onClick={() => void toggleStatus(exam)}
                              title={
                                exam.status === 'open' ? 'Close exam' : 'Open exam'
                              }
                            >
                              {exam.status === 'open' ? (
                                <Lock className="h-4 w-4" />
                              ) : (
                                <LockOpen className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                className="ms-btn-ghost px-2 py-1"
                                onClick={() => openEdit(exam)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="ms-btn-ghost px-2 py-1 text-theme-danger"
                                onClick={() => setToDelete(exam)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit exam' : 'Create exam'}
        description={
          editing
            ? 'Update the display name or notes. Class, term, and type stay fixed.'
            : 'Each class can have several exams in one term (e.g. Mid Term and End of Term).'
        }
        size="md"
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
              loading={formBusy}
              onClick={() => void submitForm()}
            >
              {editing ? 'Save' : 'Create'}
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">
                  Class
                </span>
                <select
                  className="ms-input w-full"
                  value={fClassId}
                  onChange={(e) => setFClassId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {(classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatALevelClass(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">
                  Term
                </span>
                <select
                  className="ms-input w-full"
                  value={fTermId}
                  onChange={(e) => setFTermId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {filteredTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">
                  Exam type
                </span>
                <select
                  className="ms-input w-full"
                  value={fTypeId}
                  onChange={(e) => setFTypeId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {(examTypes ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-theme-primary">
                <input
                  type="checkbox"
                  checked={fOpenNow}
                  onChange={(e) => setFOpenNow(e.target.checked)}
                />
                Open for marking immediately
              </label>
            </>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Name {editing ? '' : '(optional — defaults to type name)'}
            </span>
            <input
              className="ms-input w-full"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="e.g. Mid Term"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Notes
            </span>
            <textarea
              className="ms-input min-h-[72px] w-full"
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete exam"
        description={`Delete ${toDelete?.name}? Only exams with no grades can be deleted.`}
        variant="danger"
        confirmLabel="Delete"
        loading={deleteExam.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
