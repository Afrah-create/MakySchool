'use client';

import type { ALevelClass, ALevelTermOption } from '@makyschool/shared';

export function formatALevelClass(c: ALevelClass): string {
  return c.stream ? `${c.level} ${c.stream}` : c.level;
}

export function ClassTermPicker({
  classes,
  terms,
  classId,
  termId,
  onClassChange,
  onTermChange,
}: {
  /** S5/S6 classes only — see useALevelClasses(). */
  classes: ALevelClass[];
  terms: ALevelTermOption[];
  classId: string;
  termId: string;
  onClassChange: (id: string) => void;
  onTermChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:items-end">
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
    </div>
  );
}
