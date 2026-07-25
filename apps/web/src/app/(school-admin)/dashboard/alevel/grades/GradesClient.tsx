'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpenCheck, Lock, LockOpen, Save } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { useToast } from '@/providers/ToastProvider';
import { useCan } from '@/hooks/useCurrentRole';
import {
  useALevelClasses,
  useALevelCombinations,
  useALevelGrades,
  useALevelGradingScale,
  useALevelTerms,
  useLockALevelTerm,
  useSaveALevelGrades,
  useUnlockALevelTerm,
} from '@/hooks/useALevel';
import { ClassTermPicker } from '@/components/alevel/ClassTermPicker';
import {
  ALevelGradeGrid,
  cellKey,
} from '@/components/alevel/ALevelGradeGrid';

type Props = {
  portal?: 'admin' | 'teacher';
};

export default function ALevelGradesClient({ portal = 'admin' }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canManage = useCan('manageALevel');
  const canView = useCan('viewALevel');
  /** Head teachers + admins can close; only admins can reopen. */
  const canCloseExam = canManage || canView;
  const canReopenExam = canManage;

  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();
  const { data: combinations } = useALevelCombinations();
  const { data: scale } = useALevelGradingScale();

  const [classId, setClassId] = useState(searchParams.get('classId') ?? '');
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');

  useEffect(() => {
    const next = new URLSearchParams();
    if (classId) next.set('classId', classId);
    if (termId) next.set('termId', termId);
    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target !== current) {
      router.replace(target, { scroll: false });
    }
  }, [classId, termId, pathname, router, searchParams]);

  const selectedTerm = (terms ?? []).find((t) => t.id === termId);
  const academicYearId = selectedTerm?.academicYearId ?? '';

  const { data: grid, isPending, isError, refetch } = useALevelGrades(
    classId,
    termId,
    academicYearId,
    !!classId && !!termId && !!academicYearId,
  );

  const saveGrades = useSaveALevelGrades();
  const lockTerm = useLockALevelTerm();
  const unlockTerm = useUnlockALevelTerm();

  const [values, setValues] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [syncedGrid, setSyncedGrid] = useState<typeof grid>(undefined);

  if (grid !== syncedGrid) {
    setSyncedGrid(grid);
    const next: Record<string, string> = {};
    if (grid) {
      for (const [key, cell] of Object.entries(grid.grades)) {
        next[key] = cell.rawScore != null ? String(cell.rawScore) : '';
      }
    }
    setValues(next);
    setBaseline(next);
  }

  const comboSubjects = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of combinations ?? []) {
      map.set(c.id, new Set(c.subjects.map((s) => s.id)));
    }
    return map;
  }, [combinations]);

  const gpSubjectIds = useMemo(
    () => new Set((grid?.subjects ?? []).filter((s) => s.isGp).map((s) => s.id)),
    [grid],
  );

  const editableSet = useMemo(() => {
    if (!grid || grid.editableSubjectIds == null) return null;
    return new Set(grid.editableSubjectIds);
  }, [grid]);

  const applies = useCallback(
    (studentIdx: number, subjectId: string): boolean => {
      const student = grid?.students[studentIdx];
      if (!student) return false;
      if (gpSubjectIds.has(subjectId)) return true;
      if (student.subsidiarySubjectId === subjectId) return true;
      const principals = comboSubjects.get(student.combinationId);
      return principals ? principals.has(subjectId) : false;
    },
    [grid, gpSubjectIds, comboSubjects],
  );

  const dirtyEntries = useMemo(() => {
    if (!grid) return [];
    const entries: Array<{
      studentId: string;
      subjectId: string;
      rawScore: number | null;
    }> = [];
    for (let i = 0; i < grid.students.length; i += 1) {
      const student = grid.students[i];
      for (const subject of grid.subjects) {
        if (!applies(i, subject.id)) continue;
        if (editableSet && !editableSet.has(subject.id)) continue;
        const key = cellKey(student.studentId, subject.id);
        const current = values[key] ?? '';
        const original = baseline[key] ?? '';
        if (current === original) continue;
        const trimmed = current.trim();
        if (trimmed === '') {
          entries.push({
            studentId: student.studentId,
            subjectId: subject.id,
            rawScore: null,
          });
          continue;
        }
        const num = Number(trimmed);
        entries.push({
          studentId: student.studentId,
          subjectId: subject.id,
          rawScore: Number.isNaN(num) ? NaN : num,
        });
      }
    }
    return entries;
  }, [grid, values, baseline, applies, editableSet]);

  const changeCount = dirtyEntries.length;
  const examOpen = grid?.isOpen !== false;
  const canEdit = examOpen;

  async function submit() {
    if (!grid || changeCount === 0) return;
    for (const entry of dirtyEntries) {
      if (
        entry.rawScore != null &&
        (Number.isNaN(entry.rawScore) ||
          entry.rawScore < 0 ||
          entry.rawScore > 100)
      ) {
        toast.error('Scores must be between 0 and 100.');
        return;
      }
    }
    try {
      const result = await saveGrades.mutateAsync({
        termId,
        academicYearId,
        classId,
        entries: dirtyEntries,
      });
      const parts = [`Saved ${result.saved}`];
      if (result.cleared) parts.push(`cleared ${result.cleared}`);
      if (result.skipped) parts.push(`skipped ${result.skipped}`);
      toast.success(`${parts.join(', ')}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save grades.');
    }
  }

  async function toggleLock() {
    if (!classId || !termId || !academicYearId) return;
    try {
      if (grid?.isLocked) {
        await unlockTerm.mutateAsync({ termId, classId, academicYearId });
        toast.success('Exam reopened. Teachers can enter marks again.');
      } else {
        await lockTerm.mutateAsync({ termId, classId, academicYearId });
        toast.success('Exam closed. Grade entry is locked for this class.');
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not update exam lock.',
      );
    }
  }

  const ready = !!classId && !!termId;
  const hasGrid = grid && grid.students.length > 0;
  const lockBusy = lockTerm.isPending || unlockTerm.isPending;

  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title={portal === 'teacher' ? 'A-Level marks' : 'Enter A-Level grades'}
        description={
          portal === 'teacher'
            ? 'Enter marks for subjects you teach. An open exam must exist for the class.'
            : 'Type a term score (0–100) per subject. Grades and points are computed from the school scale and stored.'
        }
        actions={
          hasGrid ? (
            <div className="flex flex-wrap items-center gap-2">
              {portal === 'admin' &&
              ((grid!.isLocked && canReopenExam) ||
                (!grid!.isLocked && canCloseExam)) ? (
                <LoadingButton
                  variant="ghost"
                  loading={lockBusy}
                  onClick={() => void toggleLock()}
                >
                  {grid!.isLocked ? (
                    <>
                      <LockOpen className="h-4 w-4" />
                      Reopen exam
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Close exam
                    </>
                  )}
                </LoadingButton>
              ) : null}
              <LoadingButton
                variant="primary"
                loading={saveGrades.isPending}
                disabled={!canEdit || changeCount === 0}
                onClick={() => void submit()}
              >
                <Save className="h-4 w-4" />
                {changeCount > 0
                  ? `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`
                  : 'Save grades'}
              </LoadingButton>
            </div>
          ) : undefined
        }
      />

      <ClassTermPicker
        classes={classes ?? []}
        terms={terms ?? []}
        classId={classId}
        termId={termId}
        onClassChange={setClassId}
        onTermChange={setTermId}
      />

      {ready && grid ? (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            grid.isLocked
              ? 'border-theme bg-theme-danger-bg/40 text-theme-danger'
              : 'border-theme bg-theme-success-bg/40 text-theme-success'
          }`}
        >
          {grid.isLocked ? (
            <>
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                Exam closed
                {grid.lockedByName ? ` by ${grid.lockedByName}` : ''}
                {grid.lockedAt
                  ? ` · ${new Date(grid.lockedAt).toLocaleString()}`
                  : ''}
                . Marks are read-only.
              </span>
            </>
          ) : (
            <>
              <LockOpen className="h-4 w-4 shrink-0" />
              <span>Exam open — you can enter and update marks.</span>
            </>
          )}
          {editableSet ? (
            <span className="text-theme-muted">
              Editing {editableSet.size} assigned subject
              {editableSet.size === 1 ? '' : 's'}.
            </span>
          ) : null}
        </div>
      ) : null}

      {(classes ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No S5 or S6 classes"
          description={
            portal === 'teacher'
              ? 'You have no teaching assignments in Advanced-level classes, or none exist yet.'
              : 'A-Level grading applies to Advanced-level classes only. Create an S5 or S6 class first.'
          }
        />
      ) : !ready ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Select a class and term"
          description="Choose a class and term above to load the grade sheet."
        />
      ) : isPending ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load grades"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : !hasGrid ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No enrolled students"
          description="Enroll students into A-Level combinations for this class first."
        />
      ) : (
        <ALevelGradeGrid
          grid={grid!}
          combinations={combinations ?? []}
          scale={scale}
          values={values}
          onChange={(key, value) =>
            setValues((v) => ({ ...v, [key]: value }))
          }
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
