'use client';

import { useMemo } from 'react';
import type {
  ALevelCombination,
  ALevelGradesGrid,
  ALevelGradingScale,
} from '@makyschool/shared';
import {
  computeGradePreview,
  gradeBorderClass,
} from '@/lib/alevel/computeGrade';

export function cellKey(studentId: string, subjectId: string) {
  return `${studentId}:${subjectId}`;
}

type Props = {
  grid: ALevelGradesGrid;
  combinations: ALevelCombination[];
  scale: ALevelGradingScale | undefined;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** When false, all inputs are read-only (exam locked). */
  canEdit: boolean;
};

export function ALevelGradeGrid({
  grid,
  combinations,
  scale,
  values,
  onChange,
  canEdit,
}: Props) {
  const comboSubjects = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of combinations) {
      map.set(c.id, new Set(c.subjects.map((s) => s.id)));
    }
    return map;
  }, [combinations]);

  const gpSubjectIds = useMemo(
    () => new Set(grid.subjects.filter((s) => s.isGp).map((s) => s.id)),
    [grid.subjects],
  );

  const editableSet = useMemo(() => {
    if (grid.editableSubjectIds == null) return null;
    return new Set(grid.editableSubjectIds);
  }, [grid.editableSubjectIds]);

  function applies(studentIdx: number, subjectId: string): boolean {
    const student = grid.students[studentIdx];
    if (!student) return false;
    if (gpSubjectIds.has(subjectId)) return true;
    if (student.subsidiarySubjectId === subjectId) return true;
    const principals = comboSubjects.get(student.combinationId);
    return principals ? principals.has(subjectId) : false;
  }

  function canEditCell(subjectId: string): boolean {
    if (!canEdit) return false;
    if (editableSet == null) return true;
    return editableSet.has(subjectId);
  }

  function preview(subjectId: string, raw: string) {
    if (!scale || raw.trim() === '') return null;
    const num = Number(raw);
    if (Number.isNaN(num)) return null;
    const subject = grid.subjects.find((s) => s.id === subjectId);
    if (!subject) return null;
    return computeGradePreview(
      num,
      subject.subjectType,
      scale.bands,
      scale.subsidiaryPassThreshold,
    );
  }

  function rowTotal(studentId: string, studentIdx: number): number {
    let total = 0;
    for (const subject of grid.subjects) {
      if (!applies(studentIdx, subject.id)) continue;
      const raw = values[cellKey(studentId, subject.id)] ?? '';
      const p = preview(subject.id, raw);
      if (p) {
        total += p.points;
        continue;
      }
      const stored = grid.grades[cellKey(studentId, subject.id)];
      if (stored?.points != null) total += stored.points;
    }
    return total;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-table-header px-4 py-3 text-left">
                Student
              </th>
              {grid.subjects.map((s) => {
                const mine =
                  editableSet == null || editableSet.has(s.id);
                return (
                  <th
                    key={s.id}
                    className={`px-2 py-3 text-center ${
                      !mine ? 'opacity-50' : ''
                    }`}
                    title={
                      mine
                        ? s.name
                        : `${s.name} (not assigned to you)`
                    }
                  >
                    <span className="block">{s.code}</span>
                    <span className="block text-[10px] font-normal normal-case text-theme-faint">
                      {s.subjectType === 'principal'
                        ? 'Principal'
                        : s.isGp
                          ? 'GP'
                          : 'Sub'}
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-3 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {grid.students.map((student, idx) => (
              <tr key={student.id} className="border-t border-theme">
                <td className="sticky left-0 z-10 bg-theme-surface px-4 py-2">
                  <p className="font-medium text-theme-primary">
                    {student.studentName}
                  </p>
                  <p className="font-mono text-[11px] text-theme-muted">
                    {student.learnerId} · {student.combinationName}
                  </p>
                </td>
                {grid.subjects.map((subject) => {
                  const key = cellKey(student.studentId, subject.id);
                  const applicable = applies(idx, subject.id);
                  const editable = canEditCell(subject.id);
                  const raw = values[key] ?? '';
                  const live = preview(subject.id, raw);
                  const stored = grid.grades[key];
                  const shown = live ??
                    (stored?.grade
                      ? { grade: stored.grade, points: stored.points ?? 0 }
                      : null);

                  return (
                    <td key={subject.id} className="px-1.5 py-2 text-center">
                      {applicable ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            inputMode="numeric"
                            disabled={!editable}
                            className={`ms-input w-16 text-center ${gradeBorderClass(
                              shown?.grade,
                            )} ${!editable ? 'cursor-not-allowed opacity-60' : ''}`}
                            value={raw}
                            onChange={(e) => onChange(key, e.target.value)}
                            title={
                              editable
                                ? undefined
                                : grid.isLocked
                                  ? 'Exam is closed'
                                  : 'You are not assigned to this subject'
                            }
                          />
                          {shown ? (
                            <span className="text-[10px] font-semibold text-theme-muted">
                              {shown.grade}
                              {shown.points != null ? ` · ${shown.points}` : ''}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-theme-faint">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold text-theme-primary">
                  {rowTotal(student.studentId, idx)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
