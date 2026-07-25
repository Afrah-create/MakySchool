'use client';

import { useMemo, useState } from 'react';
import { BookOpenCheck, Save } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { useApiSWR } from '@/hooks/useApiSWR';
import {
  useALevelCombinations,
  useALevelGrades,
  useALevelTerms,
  useSaveALevelGrades,
} from '@/hooks/useALevel';
import {
  ClassTermPicker,
  type ClassOption,
} from '@/components/alevel/ClassTermPicker';

function cellKey(studentId: string, subjectId: string) {
  return `${studentId}:${subjectId}`;
}

export default function ALevelGradesPage() {
  const { data: classes } = useApiSWR<ClassOption[]>('/schools/classes');
  const { data: terms } = useALevelTerms();
  const { data: combinations } = useALevelCombinations();

  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');

  const selectedTerm = (terms ?? []).find((t) => t.id === termId);
  const academicYearId = selectedTerm?.academicYearId ?? '';

  const { data: grid, isPending, isError, refetch } = useALevelGrades(
    classId,
    termId,
    academicYearId,
    !!classId && !!termId && !!academicYearId,
  );

  const saveGrades = useSaveALevelGrades();

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncedGrid, setSyncedGrid] = useState<typeof grid>(undefined);

  // Sync local editable values whenever a fresh grid is fetched.
  if (grid !== syncedGrid) {
    setSyncedGrid(grid);
    const next: Record<string, string> = {};
    if (grid) {
      for (const [key, cell] of Object.entries(grid.grades)) {
        next[key] = cell.rawScore != null ? String(cell.rawScore) : '';
      }
    }
    setValues(next);
    setSaved(false);
  }

  // Map combinationId -> set of principal subject ids, for per-student applicability.
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

  function applies(studentIdx: number, subjectId: string): boolean {
    const student = grid?.students[studentIdx];
    if (!student) return false;
    if (gpSubjectIds.has(subjectId)) return true;
    if (student.subsidiarySubjectId === subjectId) return true;
    const principals = comboSubjects.get(student.combinationId);
    return principals ? principals.has(subjectId) : false;
  }

  async function submit() {
    setError(null);
    setSaved(false);
    if (!grid) return;
    const entries: Array<{
      studentId: string;
      subjectId: string;
      rawScore: number | null;
    }> = [];
    for (let i = 0; i < grid.students.length; i += 1) {
      const student = grid.students[i];
      for (const subject of grid.subjects) {
        if (!applies(i, subject.id)) continue;
        const raw = values[cellKey(student.studentId, subject.id)] ?? '';
        const trimmed = raw.trim();
        if (trimmed === '') {
          entries.push({
            studentId: student.studentId,
            subjectId: subject.id,
            rawScore: null,
          });
          continue;
        }
        const num = Number(trimmed);
        if (Number.isNaN(num) || num < 0 || num > 100) {
          setError(
            `Invalid score for ${student.studentName} — ${subject.name}. Use 0–100.`,
          );
          return;
        }
        entries.push({
          studentId: student.studentId,
          subjectId: subject.id,
          rawScore: num,
        });
      }
    }
    try {
      await saveGrades.mutateAsync({ termId, academicYearId, classId, entries });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grades.');
    }
  }

  const ready = !!classId && !!termId;
  const hasGrid = grid && grid.students.length > 0;

  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Enter A-Level grades"
        description="Type a term score (0–100) per subject. Grades and points are computed automatically."
        actions={
          hasGrid ? (
            <LoadingButton
              variant="primary"
              loading={saveGrades.isPending}
              onClick={() => void submit()}
            >
              <Save className="h-4 w-4" />
              Save grades
            </LoadingButton>
          ) : undefined
        }
      />

      <ClassTermPicker
        classes={classes ?? []}
        terms={terms ?? []}
        classId={classId}
        termId={termId}
        onClassChange={(v) => {
          setClassId(v);
          setSaved(false);
        }}
        onTermChange={(v) => {
          setTermId(v);
          setSaved(false);
        }}
      />

      {error ? (
        <div className="rounded-xl border border-theme bg-theme-danger-bg/50 px-4 py-3 text-sm text-theme-danger">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-xl border border-theme bg-theme-success-bg/50 px-4 py-3 text-sm text-theme-success">
          Grades saved.
        </div>
      ) : null}

      {!ready ? (
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
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="sticky left-0 z-10 bg-table-header px-4 py-3 text-left">
                    Student
                  </th>
                  {grid!.subjects.map((s) => (
                    <th key={s.id} className="px-2 py-3 text-center" title={s.name}>
                      <span className="block">{s.code}</span>
                      <span className="block text-[10px] font-normal normal-case text-theme-faint">
                        {s.subjectType === 'principal' ? 'Principal' : s.isGp ? 'GP' : 'Sub'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid!.students.map((student, idx) => (
                  <tr key={student.id} className="border-t border-theme">
                    <td className="sticky left-0 z-10 bg-theme-surface px-4 py-2">
                      <p className="font-medium text-theme-primary">{student.studentName}</p>
                      <p className="font-mono text-[11px] text-theme-muted">
                        {student.learnerId} · {student.combinationName}
                      </p>
                    </td>
                    {grid!.subjects.map((subject) => {
                      const key = cellKey(student.studentId, subject.id);
                      const applicable = applies(idx, subject.id);
                      const cell = grid!.grades[key];
                      return (
                        <td key={subject.id} className="px-1.5 py-2 text-center">
                          {applicable ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                inputMode="numeric"
                                className="ms-input w-16 text-center"
                                value={values[key] ?? ''}
                                onChange={(e) => {
                                  setValues((v) => ({ ...v, [key]: e.target.value }));
                                  setSaved(false);
                                }}
                              />
                              {cell?.grade ? (
                                <span className="text-[10px] font-semibold text-theme-muted">
                                  {cell.grade}
                                  {cell.points != null ? ` · ${cell.points}` : ''}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-theme-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
