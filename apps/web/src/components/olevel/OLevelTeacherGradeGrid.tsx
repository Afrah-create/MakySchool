"use client";

import { useMemo } from "react";
import type { OLevelSessionMarkGridResponse } from "@makyschool/shared";

export function cellKey(studentId: string, subjectId: string) {
  return `${studentId}:${subjectId}`;
}

type Props = {
  grid: OLevelSessionMarkGridResponse;
  values: Record<string, string>;
  absent: Record<string, boolean>;
  onChange: (key: string, value: string) => void;
  onAbsentChange: (key: string, isAbsent: boolean) => void;
  canEdit: boolean;
  gradeFor: (score: number | null) => string;
};

export function OLevelTeacherGradeGrid({
  grid,
  values,
  absent,
  onChange,
  onAbsentChange,
  canEdit,
  gradeFor,
}: Props) {
  const editableSet = useMemo(
    () => new Set(grid.editableSubjectIds),
    [grid.editableSubjectIds],
  );
  const registered = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const student of grid.students) {
      map.set(student.studentId, new Set(student.registeredSubjectIds));
    }
    return map;
  }, [grid.students]);

  function applies(studentId: string, subjectId: string) {
    return registered.get(studentId)?.has(subjectId) ?? false;
  }

  function canEditCell(subjectId: string) {
    return canEdit && editableSet.has(subjectId);
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
                const mine = editableSet.has(s.id);
                return (
                  <th
                    key={s.id}
                    className={`min-w-[5.5rem] px-2 py-3 text-center ${!mine ? "opacity-50" : ""}`}
                    title={mine ? s.name : `${s.name} (locked)`}
                  >
                    <span className="block">{s.code}</span>
                    <span className="block max-w-[6rem] truncate text-[10px] font-normal normal-case text-theme-faint">
                      {s.name}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.students.map((student) => (
              <tr key={student.studentId} className="border-t border-theme">
                <td className="sticky left-0 z-10 bg-theme-surface px-4 py-2">
                  <p className="font-medium text-theme-primary">{student.studentName}</p>
                  <p className="font-mono text-[11px] text-theme-muted">
                    {student.learnerId || "—"}
                  </p>
                </td>
                {grid.subjects.map((subject) => {
                  const key = cellKey(student.studentId, subject.id);
                  const applicable = applies(student.studentId, subject.id);
                  const editable = canEditCell(subject.id);
                  const isAbsent = Boolean(absent[key]);
                  const raw = values[key] ?? "";
                  const scoreNum =
                    raw.trim() === "" || isAbsent ? null : Number(raw);
                  const liveGrade =
                    scoreNum === null || Number.isNaN(scoreNum)
                      ? null
                      : gradeFor(scoreNum);

                  return (
                    <td key={subject.id} className="px-1.5 py-2 text-center align-top">
                      {applicable ? (
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={grid.maxMarks}
                            inputMode="decimal"
                            disabled={!editable || isAbsent}
                            className={`ms-input w-16 text-center ${
                              !editable ? "cursor-not-allowed opacity-60" : ""
                            }`}
                            value={isAbsent ? "" : raw}
                            onChange={(e) => onChange(key, e.target.value)}
                            title={
                              editable
                                ? undefined
                                : "This subject is locked"
                            }
                          />
                          <label className="flex items-center gap-1 text-[10px] text-theme-muted">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={isAbsent}
                              disabled={!editable}
                              onChange={(e) =>
                                onAbsentChange(key, e.target.checked)
                              }
                            />
                            Abs
                          </label>
                          {liveGrade ? (
                            <span className="text-[10px] font-semibold text-theme-muted">
                              {liveGrade}
                            </span>
                          ) : isAbsent ? (
                            <span className="text-[10px] text-theme-muted">Absent</span>
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
            {!grid.students.length ? (
              <tr>
                <td
                  colSpan={grid.subjects.length + 1}
                  className="p-6 text-center text-theme-muted"
                >
                  No students enrolled in this class yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
