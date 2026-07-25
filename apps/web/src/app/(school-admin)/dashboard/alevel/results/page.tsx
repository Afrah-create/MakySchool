'use client';

import { useState } from 'react';
import { Award, Download } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import type { ALevelStudentResult } from '@makyschool/shared';
import { useApiSWR } from '@/hooks/useApiSWR';
import { useALevelResults, useALevelTerms } from '@/hooks/useALevel';
import {
  ClassTermPicker,
  type ClassOption,
} from '@/components/alevel/ClassTermPicker';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate',
  '2': 'Partial',
  '6': 'Incomplete',
};

function gradeFor(result: ALevelStudentResult, subjectId: string) {
  const subject = result.subjects.find((s) => s.subjectId === subjectId);
  return subject?.grade ?? '';
}

function classLabel(c: ClassOption | undefined) {
  if (!c) return '';
  return c.stream ? `${c.level} ${c.stream}` : c.level;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ALevelResultsPage() {
  const { data: classes } = useApiSWR<ClassOption[]>('/schools/classes');
  const { data: terms } = useALevelTerms();

  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');

  const selectedTerm = (terms ?? []).find((t) => t.id === termId);
  const academicYearId = selectedTerm?.academicYearId ?? '';

  const { data, isPending, isError, refetch } = useALevelResults(
    classId,
    termId,
    academicYearId,
    !!classId && !!termId && !!academicYearId,
  );

  const ready = !!classId && !!termId;
  const results = data?.results ?? [];
  const subjects = data?.subjects ?? [];

  function exportCsv() {
    const header = [
      'Position',
      'Student',
      'Learner ID',
      'Combination',
      ...subjects.map((s) => s.code),
      'Principal points',
      'GP',
      'Subsidiary',
      'Total points',
      'Result',
    ];
    const rows = results.map((r) => [
      String(r.position),
      r.studentName,
      r.learnerId,
      r.combinationName,
      ...subjects.map((s) => gradeFor(r, s.id)),
      String(r.best_principal_points),
      String(r.gp_points),
      String(r.subsidiary_points),
      String(r.total_points),
      RESULT_LABEL[r.result_code] ?? r.result_code,
    ]);
    const cls = classLabel(classes?.find((c) => c.id === classId));
    downloadCsv(
      `alevel-results-${cls || 'class'}-${selectedTerm?.name ?? ''}.csv`.replace(/\s+/g, '-'),
      [header, ...rows],
    );
  }

  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level results"
        description="Ranked termly results with computed points and result codes."
        actions={
          results.length > 0 ? (
            <button type="button" onClick={exportCsv} className="ms-btn-secondary">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
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

      {!ready ? (
        <EmptyState
          icon={Award}
          title="Select a class and term"
          description="Choose a class and term above to view results."
        />
      ) : isPending ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load results"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No results yet"
          description="Enroll students and enter grades to see results here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-3 py-3 text-left">#</th>
                  <th className="sticky left-0 z-10 bg-table-header px-4 py-3 text-left">
                    Student
                  </th>
                  {subjects.map((s) => (
                    <th key={s.id} className="px-2 py-3 text-center" title={s.name}>
                      {s.code}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">Prin.</th>
                  <th className="px-3 py-3 text-center">GP</th>
                  <th className="px-3 py-3 text-center">Sub.</th>
                  <th className="px-3 py-3 text-center">Total</th>
                  <th className="px-3 py-3 text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.studentId} className="border-t border-theme hover:bg-theme-raised/40">
                    <td className="px-3 py-2 text-theme-muted">{r.position}</td>
                    <td className="sticky left-0 z-10 bg-theme-surface px-4 py-2">
                      <p className="font-medium text-theme-primary">{r.studentName}</p>
                      <p className="font-mono text-[11px] text-theme-muted">
                        {r.learnerId} · {r.combinationName}
                      </p>
                    </td>
                    {subjects.map((s) => (
                      <td key={s.id} className="px-2 py-2 text-center text-theme-primary">
                        {gradeFor(r, s.id) || '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-theme-primary">
                      {r.best_principal_points}
                    </td>
                    <td className="px-3 py-2 text-center text-theme-muted">{r.gp_points}</td>
                    <td className="px-3 py-2 text-center text-theme-muted">
                      {r.subsidiary_points}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-theme-primary">
                      {r.total_points}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-full bg-theme-accent-muted px-2 py-0.5 text-[11px] font-medium text-theme-accent">
                        {RESULT_LABEL[r.result_code] ?? r.result_code}
                      </span>
                    </td>
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
