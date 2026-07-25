'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type {
  ALevelCombinationCategory,
  ALevelEnrollment,
} from '@makyschool/shared';
import { useApiSWR } from '@/hooks/useApiSWR';
import { useToast } from '@/providers/ToastProvider';
import type { StudentsListResponse } from '@/lib/students/types';
import {
  useALevelClasses,
  useALevelCombinations,
  useALevelEnrollments,
  useALevelSubjects,
  useALevelTerms,
  useCreateALevelEnrollment,
  useDeleteALevelEnrollment,
} from '@/hooks/useALevel';
import { BulkEnrollPanel } from '@/components/alevel/BulkEnrollPanel';

const CATEGORIES: ALevelCombinationCategory[] = [
  'science',
  'arts',
  'business',
  'technical',
];

type YearOption = { id: string; year: number; isCurrent: boolean };

export default function ALevelEnrollmentsPage() {
  const { toast } = useToast();
  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();
  const { data: combinations } = useALevelCombinations();
  const { data: subjects } = useALevelSubjects();

  const years = useMemo<YearOption[]>(() => {
    const map = new Map<string, YearOption>();
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
  const [combinationFilter, setCombinationFilter] = useState('');
  const [category, setCategory] = useState<ALevelCombinationCategory | ''>('');
  const [search, setSearch] = useState('');

  const effectiveYear =
    academicYearId || years.find((y) => y.isCurrent)?.id || years[0]?.id || '';

  const hasFilters =
    !!classId || !!combinationFilter || !!category || !!search.trim();

  const {
    data: enrollments,
    isPending,
    isError,
    refetch,
  } = useALevelEnrollments(
    {
      academicYearId: effectiveYear,
      classId,
      combinationId: combinationFilter,
      category,
      search: search.trim(),
    },
    !!effectiveYear,
  );

  // Unfiltered roster for the year: used to know who is already enrolled so the
  // enroll dialogs never offer a duplicate.
  const { data: yearEnrollments } = useALevelEnrollments(
    { academicYearId: effectiveYear },
    !!effectiveYear,
  );
  const enrolledStudentIds = useMemo(
    () => new Set((yearEnrollments ?? []).map((e) => e.studentId)),
    [yearEnrollments],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ALevelEnrollment | null>(null);

  const [studentId, setStudentId] = useState('');
  const [combinationId, setCombinationId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState('');

  const { data: studentsResp } = useApiSWR<StudentsListResponse>(
    formOpen && classId
      ? `/schools/students?class_id=${classId}&status=active&limit=100`
      : null,
  );
  const availableStudents = (studentsResp?.students ?? []).filter(
    (s) => !enrolledStudentIds.has(s.id),
  );

  const subsidiaries = (subjects ?? []).filter(
    (s) => s.subjectType === 'subsidiary' && !s.isGp && s.isActive,
  );

  const createEnrollment = useCreateALevelEnrollment();
  const deleteEnrollment = useDeleteALevelEnrollment();

  const selectedClass = (classes ?? []).find((c) => c.id === classId);
  const selectedClassName = selectedClass
    ? selectedClass.stream
      ? `${selectedClass.level} ${selectedClass.stream}`
      : selectedClass.level
    : '';

  function openCreate() {
    setStudentId('');
    setCombinationId('');
    setSubsidiaryId('');
    setFormOpen(true);
  }

  function clearFilters() {
    setClassId('');
    setCombinationFilter('');
    setCategory('');
    setSearch('');
  }

  async function submit() {
    if (!studentId || !combinationId || !effectiveYear) {
      toast.error('Select a student and a combination.');
      return;
    }
    try {
      const enrollment = await createEnrollment.mutateAsync({
        studentId,
        combinationId,
        academicYearId: effectiveYear,
        subsidiarySubjectId: subsidiaryId || null,
        classId: classId || null,
      });
      toast.success(
        `${enrollment.studentName} enrolled into ${enrollment.combinationName}.`,
      );
      setFormOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not enroll student.',
      );
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const name = toDelete.studentName;
    try {
      await deleteEnrollment.mutateAsync(toDelete.id);
      toast.success(`Removed ${name} from A-Level.`);
      setToDelete(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not remove enrollment.',
      );
      setToDelete(null);
    }
  }

  const noALevelClasses = (classes ?? []).length === 0;
  const canEnroll = !!classId && !!effectiveYear;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level enrollments"
        description="Assign each S5/S6 student a combination and subsidiary for the academic year."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="ms-btn-secondary"
              disabled={!canEnroll}
              title={canEnroll ? undefined : 'Select a class first'}
            >
              <UsersRound className="h-4 w-4" />
              Bulk enroll
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="ms-btn-primary"
              disabled={!canEnroll}
              title={canEnroll ? undefined : 'Select a class first'}
            >
              <Plus className="h-4 w-4" />
              Enroll student
            </button>
          </div>
        }
      />

      {noALevelClasses ? (
        <EmptyState
          icon={UsersRound}
          title="No S5 or S6 classes"
          description="Subject combinations are only offered at Advanced level. Create an S5 or S6 class first."
          action={
            <Link href="/dashboard/classes" className="ms-btn-primary">
              Manage classes
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Academic year
              </span>
              <select
                className="ms-input"
                value={effectiveYear}
                onChange={(e) => setAcademicYearId(e.target.value)}
              >
                {years.length === 0 ? <option value="">No years</option> : null}
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
                <option value="">All A-Level classes</option>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.stream ? `${c.level} ${c.stream}` : c.level}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Combination
              </span>
              <select
                className="ms-input"
                value={combinationFilter}
                onChange={(e) => setCombinationFilter(e.target.value)}
              >
                <option value="">All combinations</option>
                {(combinations ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Stream
              </span>
              <select
                className="ms-input capitalize"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ALevelCombinationCategory | '')
                }
              >
                <option value="">All streams</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[14rem] flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Search
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
                <input
                  className="ms-input w-full pl-9"
                  placeholder="Name or learner ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </span>
            </label>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ms-btn-ghost"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            ) : null}
          </div>

          {isPending && effectiveYear ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : isError ? (
            <EmptyState
              variant="error"
              title="Couldn’t load enrollments"
              description="Check your connection and try again."
              onRetry={() => void refetch()}
            />
          ) : (enrollments ?? []).length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title={hasFilters ? 'No matching enrollments' : 'No enrollments'}
              description={
                hasFilters
                  ? 'Adjust or clear the filters to see more students.'
                  : 'Enroll students into their A-Level combinations to begin grading.'
              }
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-theme-muted">
                {enrollments!.length} student
                {enrollments!.length === 1 ? '' : 's'} enrolled
              </p>
              <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                <div className="overflow-x-auto">
                  <table className="ms-table w-full min-w-[46rem]">
                    <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                      <tr>
                        <th className="px-4 py-3 text-left">Student</th>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Combination</th>
                        <th className="px-4 py-3 text-left">Subsidiary</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(enrollments ?? []).map((e) => (
                        <tr
                          key={e.id}
                          className="border-t border-theme hover:bg-theme-raised/40"
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-theme-primary">
                              {e.studentName}
                            </p>
                            <p className="font-mono text-[11px] text-theme-muted">
                              {e.learnerId}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-theme-muted">
                            {e.className || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-theme-primary">
                            {e.combinationName}
                          </td>
                          <td className="px-4 py-3 text-sm text-theme-muted">
                            {e.subsidiarySubjectName || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="ms-btn-ghost px-2 py-1 text-theme-danger"
                                onClick={() => setToDelete(e)}
                                aria-label="Remove"
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
              </div>
            </div>
          )}
        </>
      )}

      <BulkEnrollPanel
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        classId={classId}
        className={selectedClassName}
        academicYearId={effectiveYear}
        combinations={combinations ?? []}
        subsidiaries={subsidiaries}
        enrolledStudentIds={enrolledStudentIds}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Enroll student"
        description={`Active students in ${selectedClassName || 'the selected class'} who are not already enrolled.`}
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
              loading={createEnrollment.isPending}
              onClick={() => void submit()}
            >
              Enroll
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Student
            </span>
            <select
              className="ms-input w-full"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Select a student…</option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · {s.learner_id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Combination
            </span>
            <select
              className="ms-input w-full"
              value={combinationId}
              onChange={(e) => setCombinationId(e.target.value)}
            >
              <option value="">Select a combination…</option>
              {(combinations ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Subsidiary subject (optional)
            </span>
            <select
              className="ms-input w-full"
              value={subsidiaryId}
              onChange={(e) => setSubsidiaryId(e.target.value)}
            >
              <option value="">None</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Remove enrollment"
        description={`Remove ${toDelete?.studentName} from A-Level? Their grades for the year will also be removed.`}
        variant="danger"
        confirmLabel="Remove"
        loading={deleteEnrollment.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
