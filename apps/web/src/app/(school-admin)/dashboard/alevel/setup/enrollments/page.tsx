'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, UsersRound } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { Modal } from '@makyschool/ui/components/ui/Modal';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type { ALevelEnrollment } from '@makyschool/shared';
import { useApiSWR } from '@/hooks/useApiSWR';
import type { StudentsListResponse } from '@/lib/students/types';
import {
  useALevelCombinations,
  useALevelEnrollments,
  useALevelSubjects,
  useALevelTerms,
  useCreateALevelEnrollment,
  useDeleteALevelEnrollment,
} from '@/hooks/useALevel';
import type { ClassOption } from '@/components/alevel/ClassTermPicker';

type YearOption = { id: string; year: number; isCurrent: boolean };

export default function ALevelEnrollmentsPage() {
  const { data: classes } = useApiSWR<ClassOption[]>('/schools/classes');
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

  const effectiveYear =
    academicYearId || years.find((y) => y.isCurrent)?.id || years[0]?.id || '';

  const {
    data: enrollments,
    isPending,
    isError,
    refetch,
  } = useALevelEnrollments(effectiveYear, classId, !!effectiveYear);

  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ALevelEnrollment | null>(null);

  const [studentId, setStudentId] = useState('');
  const [combinationId, setCombinationId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState('');

  const { data: studentsResp } = useApiSWR<StudentsListResponse>(
    classId ? `/schools/students?class_id=${classId}&status=active&limit=100` : null,
  );
  const students = studentsResp?.students ?? [];
  const enrolledStudentIds = new Set((enrollments ?? []).map((e) => e.studentId));
  const availableStudents = students.filter((s) => !enrolledStudentIds.has(s.id));

  const subsidiaries = (subjects ?? []).filter(
    (s) => s.subjectType === 'subsidiary' && !s.isGp && s.isActive,
  );

  const createEnrollment = useCreateALevelEnrollment();
  const deleteEnrollment = useDeleteALevelEnrollment();

  function openCreate() {
    setStudentId('');
    setCombinationId('');
    setSubsidiaryId('');
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    setError(null);
    if (!studentId || !combinationId || !effectiveYear) {
      setError('Select a student and a combination.');
      return;
    }
    try {
      await createEnrollment.mutateAsync({
        studentId,
        combinationId,
        academicYearId: effectiveYear,
        subsidiarySubjectId: subsidiaryId || null,
        classId: classId || null,
      });
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll student.');
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteEnrollment.mutateAsync(toDelete.id);
      setToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove enrollment.');
      setToDelete(null);
    }
  }

  const canEnroll = !!classId && !!effectiveYear;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level enrollments"
        description="Assign each student a combination and subsidiary for the academic year."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="ms-btn-primary"
            disabled={!canEnroll}
          >
            <Plus className="h-4 w-4" />
            Enroll student
          </button>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:items-end">
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
            <option value="">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.stream ? `${c.level} ${c.stream}` : c.level}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && !formOpen ? (
        <div className="rounded-xl border border-theme bg-theme-danger-bg/50 px-4 py-3 text-sm text-theme-danger">
          {error}
        </div>
      ) : null}

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
          title="No enrollments"
          description="Enroll students into their A-Level combinations to begin grading."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="overflow-x-auto">
            <table className="ms-table w-full min-w-[42rem]">
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
                  <tr key={e.id} className="border-t border-theme hover:bg-theme-raised/40">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-theme-primary">{e.studentName}</p>
                      <p className="font-mono text-[11px] text-theme-muted">{e.learnerId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-theme-muted">{e.className || '—'}</td>
                    <td className="px-4 py-3 text-sm text-theme-primary">{e.combinationName}</td>
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
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Enroll student"
        description="Only active students in the selected class who are not already enrolled are shown."
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="ms-btn-ghost" onClick={() => setFormOpen(false)}>
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
          {error ? (
            <div className="rounded-lg border border-theme bg-theme-danger-bg/50 px-3 py-2 text-sm text-theme-danger">
              {error}
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">Student</span>
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
            <span className="mb-1 block text-sm font-medium text-theme-primary">Combination</span>
            <select
              className="ms-input w-full"
              value={combinationId}
              onChange={(e) => setCombinationId(e.target.value)}
            >
              <option value="">Select a combination…</option>
              {(combinations ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
