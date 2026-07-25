'use client';

import type { ALevelClass, ALevelExam, ALevelTermOption } from '@makyschool/shared';
import { formatALevelClass } from '@/components/alevel/ClassTermPicker';

export function ClassExamPicker({
  classes,
  terms,
  exams,
  classId,
  termId,
  examId,
  onClassChange,
  onTermChange,
  onExamChange,
  examsLoading,
}: {
  classes: ALevelClass[];
  terms: ALevelTermOption[];
  exams: ALevelExam[];
  classId: string;
  termId: string;
  examId: string;
  onClassChange: (id: string) => void;
  onTermChange: (id: string) => void;
  onExamChange: (id: string) => void;
  examsLoading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
          Class
        </span>
        <select
          className="ms-input"
          value={classId}
          onChange={(e) => onClassChange(e.target.value)}
          disabled={classes.length === 0}
        >
          <option value="">
            {classes.length === 0 ? 'No S5/S6 classes' : 'Select a class…'}
          </option>
          {classes.map((c) => (
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
          onChange={(e) => onTermChange(e.target.value)}
        >
          <option value="">Select a term…</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.year}
              {t.isCurrent ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-[12rem] flex-1">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
          Exam
        </span>
        <select
          className="ms-input w-full"
          value={examId}
          onChange={(e) => onExamChange(e.target.value)}
          disabled={!classId || !termId || examsLoading}
        >
          <option value="">
            {!classId || !termId
              ? 'Select class and term first…'
              : examsLoading
                ? 'Loading exams…'
                : exams.length === 0
                  ? 'No exams for this class/term'
                  : 'Select an exam…'}
          </option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.status === 'open'
                ? ' · open'
                : e.status === 'closed'
                  ? ' · closed'
                  : ' · draft'}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
