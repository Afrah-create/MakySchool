'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpenCheck, Lock, LockOpen, Save, Send, Unlock } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { ConfirmDialog } from '@makyschool/ui/components/ui/ConfirmDialog';
import { useToast } from '@/providers/ToastProvider';
import {
  useALevelClasses,
  useALevelCombinations,
  useALevelExams,
  useALevelGrades,
  useALevelGradingScale,
  useALevelTerms,
  useSaveALevelGrades,
  useSubmitALevelMarks,
  useUnlockALevelTeacherSubmission,
} from '@/hooks/useALevel';
import { ClassExamPicker } from '@/components/alevel/ClassExamPicker';
import {
  ALevelGradeGrid,
  cellKey,
} from '@/components/alevel/ALevelGradeGrid';

type Props = {
  portal?: 'admin' | 'teacher';
};

type UnlockTarget = { teacherId: string; teacherName: string };

export default function ALevelGradesClient({ portal = 'admin' }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTeacher = portal === 'teacher';

  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();
  const { data: combinations } = useALevelCombinations();
  const { data: scale } = useALevelGradingScale();

  const [classId, setClassId] = useState(searchParams.get('classId') ?? '');
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');
  const [examId, setExamId] = useState(searchParams.get('examId') ?? '');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<UnlockTarget | null>(null);

  const { data: exams, isPending: examsLoading } = useALevelExams(
    classId && termId ? { classId, termId } : {},
    (!!classId && !!termId) || !!examId,
  );

  useEffect(() => {
    if (!examId || (classId && termId)) return;
    const match = (exams ?? []).find((e) => e.id === examId);
    if (match) {
      setClassId(match.classId);
      setTermId(match.termId);
    }
  }, [examId, exams, classId, termId]);

  useEffect(() => {
    if (!examId || !exams) return;
    if (!exams.some((e) => e.id === examId)) {
      setExamId(exams[0]?.id ?? '');
    }
  }, [exams, examId]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (classId) next.set('classId', classId);
    if (termId) next.set('termId', termId);
    if (examId) next.set('examId', examId);
    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target !== current) {
      router.replace(target, { scroll: false });
    }
  }, [classId, termId, examId, pathname, router, searchParams]);

  const { data: grid, isPending, isError, refetch } = useALevelGrades(
    examId,
    !!examId,
  );

  const saveGrades = useSaveALevelGrades();
  const submitMarks = useSubmitALevelMarks();
  const unlockSubmission = useUnlockALevelTeacherSubmission();

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
  const canEdit = grid?.canEdit === true;

  async function saveDraft() {
    if (!grid || !examId || changeCount === 0 || !canEdit) return;
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
        examId,
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

  function requestSubmit() {
    if (!examId || !canEdit) return;
    if (changeCount > 0) {
      toast.error('Save your draft changes before submitting.');
      return;
    }
    setSubmitOpen(true);
  }

  async function confirmSubmit() {
    if (!examId || !canEdit) return;
    try {
      await submitMarks.mutateAsync(examId);
      setSubmitOpen(false);
      toast.success('Marks submitted. Editing is now locked.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not submit marks.',
      );
    }
  }

  async function confirmUnlock() {
    if (!examId || !unlockTarget) return;
    try {
      await unlockSubmission.mutateAsync({
        examId,
        teacherId: unlockTarget.teacherId,
      });
      toast.success(`${unlockTarget.teacherName} can enter marks again.`);
      setUnlockTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not unlock teacher.',
      );
    }
  }

  const ready = !!examId;
  const hasGrid = grid && grid.students.length > 0;
  const submissions = grid?.submissions ?? [];

  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title={isTeacher ? 'A-Level marks' : 'View A-Level grades'}
        description={
          isTeacher
            ? 'Enter marks for subjects you teach, then submit. After submit, marks are locked until unlocked.'
            : 'View all marks for an exam. Teachers enter and submit; unlock a teacher to allow resubmission.'
        }
        actions={
          hasGrid && isTeacher ? (
            <div className="flex flex-wrap items-center gap-2">
              <LoadingButton
                variant="ghost"
                loading={saveGrades.isPending}
                disabled={!canEdit || changeCount === 0}
                onClick={() => void saveDraft()}
              >
                <Save className="h-4 w-4" />
                {changeCount > 0
                  ? `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`
                  : 'Save draft'}
              </LoadingButton>
              <LoadingButton
                variant="primary"
                loading={submitMarks.isPending}
                disabled={!canEdit || changeCount > 0}
                onClick={requestSubmit}
              >
                <Send className="h-4 w-4" />
                Submit marks
              </LoadingButton>
            </div>
          ) : undefined
        }
      />

      <ClassExamPicker
        classes={classes ?? []}
        terms={terms ?? []}
        exams={exams ?? []}
        classId={classId}
        termId={termId}
        examId={examId}
        onClassChange={(id) => {
          setClassId(id);
          setExamId('');
        }}
        onTermChange={(id) => {
          setTermId(id);
          setExamId('');
        }}
        onExamChange={setExamId}
        examsLoading={examsLoading}
      />

      {ready && grid ? (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            grid.isSubmitted
              ? 'border-theme bg-theme-warning-bg/40 text-theme-warning'
              : grid.isOpen
                ? 'border-theme bg-theme-success-bg/40 text-theme-success'
                : 'border-theme bg-theme-danger-bg/40 text-theme-danger'
          }`}
        >
          {isTeacher && grid.isSubmitted ? (
            <>
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                You submitted marks
                {grid.submittedAt
                  ? ` on ${new Date(grid.submittedAt).toLocaleString()}`
                  : ''}
                . Ask an admin or head teacher to unlock if you need to resubmit.
              </span>
            </>
          ) : grid.isOpen ? (
            <>
              <LockOpen className="h-4 w-4 shrink-0" />
              <span>
                {isTeacher
                  ? `${grid.examName} is open — save a draft, then submit to lock your marks.`
                  : `${grid.examName} is open — view only. Teachers enter and submit marks.`}
              </span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                {grid.examName} is {grid.examStatus}. Marks are read-only.
              </span>
            </>
          )}
          {isTeacher && editableSet ? (
            <span className="text-theme-muted">
              Your subjects: {editableSet.size}
            </span>
          ) : null}
        </div>
      ) : null}

      {!isTeacher && ready && grid && submissions.length > 0 ? (
        <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
          <p className="mb-2 text-sm font-medium text-theme">
            Submitted teachers
          </p>
          <ul className="space-y-2">
            {submissions.map((s) => (
              <li
                key={s.teacherId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {s.teacherName}
                  {s.submittedAt ? (
                    <span className="text-theme-muted">
                      {' '}
                      · {new Date(s.submittedAt).toLocaleString()}
                    </span>
                  ) : null}
                </span>
                <LoadingButton
                  variant="ghost"
                  loading={
                    unlockSubmission.isPending &&
                    unlockSubmission.variables?.teacherId === s.teacherId
                  }
                  onClick={() =>
                    setUnlockTarget({
                      teacherId: s.teacherId,
                      teacherName: s.teacherName,
                    })
                  }
                >
                  <Unlock className="h-4 w-4" />
                  Unlock
                </LoadingButton>
              </li>
            ))}
          </ul>
        </div>
      ) : !isTeacher && ready && grid && grid.isOpen ? (
        <p className="text-sm text-theme-muted">
          No teachers have submitted marks for this exam yet.
        </p>
      ) : null}

      {(classes ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No S5 or S6 classes"
          description={
            isTeacher
              ? 'You have no teaching assignments in Advanced-level classes.'
              : 'Create an S5 or S6 class first.'
          }
        />
      ) : !classId || !termId ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Select a class and term"
          description="Then choose an exam to load the grade sheet."
        />
      ) : !examId ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No exam selected"
          description="Create an exam for this class and term, then open it for marking."
          action={
            !isTeacher ? (
              <Link href="/dashboard/alevel/exams" className="ms-btn-primary">
                Manage exams
              </Link>
            ) : undefined
          }
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

      <ConfirmDialog
        open={submitOpen}
        title="Submit marks?"
        description="After you submit, you will not be able to edit these marks until an admin or head teacher unlocks you."
        confirmLabel="Submit marks"
        loading={submitMarks.isPending}
        onConfirm={() => void confirmSubmit()}
        onCancel={() => setSubmitOpen(false)}
      />

      <ConfirmDialog
        open={!!unlockTarget}
        title="Unlock teacher?"
        description={
          unlockTarget
            ? `Unlock ${unlockTarget.teacherName} so they can edit and resubmit marks for this exam.`
            : ''
        }
        confirmLabel="Unlock"
        loading={unlockSubmission.isPending}
        onConfirm={() => void confirmUnlock()}
        onCancel={() => setUnlockTarget(null)}
      />
    </div>
  );
}
