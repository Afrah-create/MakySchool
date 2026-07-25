'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Award, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import type { ALevelClass, ALevelStudentResult } from '@makyschool/shared';
import { useToast } from '@/providers/ToastProvider';
import { useSchool } from '@/providers/SchoolProvider';
import {
  useALevelClasses,
  useALevelExams,
  useALevelResults,
  useALevelTerms,
} from '@/hooks/useALevel';
import { ClassExamPicker } from '@/components/alevel/ClassExamPicker';
import { formatALevelClass } from '@/components/alevel/ClassTermPicker';
import {
  ALEVEL_RESULTS_SORT_OPTIONS,
  alevelResultsCsvFilename,
  buildALevelResultsCsv,
  downloadALevelResultsCsv,
  sortALevelResults,
  type ALevelResultsSortDir,
  type ALevelResultsSortKey,
} from '@/lib/alevel/exportResultsCsv';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate',
  '2': 'Partial',
  '6': 'Incomplete',
};

function gradeFor(result: ALevelStudentResult, subjectId: string) {
  const subject = result.subjects.find((s) => s.subjectId === subjectId);
  return subject?.grade ?? '';
}

function classLabel(c: ALevelClass | undefined) {
  return c ? formatALevelClass(c) : '';
}

export default function ALevelResultsPage() {
  const { toast } = useToast();
  const { school } = useSchool();
  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();

  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [examId, setExamId] = useState('');
  const [sortKey, setSortKey] = useState<ALevelResultsSortKey>('position');
  const [sortDir, setSortDir] = useState<ALevelResultsSortDir>('asc');

  const { data: exams, isPending: examsLoading } = useALevelExams(
    { classId, termId },
    !!classId && !!termId,
  );

  useEffect(() => {
    if (!examId || !exams) return;
    if (!exams.some((e) => e.id === examId)) {
      setExamId(exams[0]?.id ?? '');
    }
  }, [exams, examId]);

  const selectedExam = (exams ?? []).find((e) => e.id === examId);
  const selectedTerm = (terms ?? []).find((t) => t.id === termId);
  const selectedClass = (classes ?? []).find((c) => c.id === classId);

  const { data, isPending, isError, refetch } = useALevelResults(
    examId,
    !!examId,
  );

  const results = data?.results ?? [];
  const subjects = data?.subjects ?? [];
  const summary = data?.summary;

  const sortedResults = useMemo(
    () => sortALevelResults(results, sortKey, sortDir),
    [results, sortKey, sortDir],
  );

  function exportCsv() {
    if (results.length === 0) {
      toast.error('No results to export.');
      return;
    }
    try {
      const csv = buildALevelResultsCsv({
        results,
        subjects,
        summary,
        meta: {
          schoolName: school?.name ?? null,
          className: classLabel(selectedClass),
          termName: selectedTerm?.name ?? null,
          examName: selectedExam?.name ?? data?.examName ?? null,
          examTypeName: selectedExam?.examTypeName ?? null,
          academicYearLabel: selectedTerm?.year
            ? String(selectedTerm.year)
            : null,
        },
        sortKey,
        sortDir,
      });
      const filename = alevelResultsCsvFilename({
        className: classLabel(selectedClass),
        examName: selectedExam?.name ?? selectedTerm?.name,
        termName: selectedTerm?.name,
      });
      downloadALevelResultsCsv(filename, csv);
      toast.success(`Exported ${results.length} results to CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export CSV.');
    }
  }

  const reportHref = examId
    ? `/dashboard/alevel/report-cards?examId=${examId}`
    : '/dashboard/alevel/report-cards';

  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level results"
        description="Ranked exam results with computed points and result codes. Export a formatted CSV with metadata, dual headers, and subject summaries."
        actions={
          results.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-theme-muted">
                <span className="sr-only">Sort by</span>
                <select
                  className="ms-input h-10 min-w-[10rem] py-1 text-sm"
                  value={sortKey}
                  onChange={(e) =>
                    setSortKey(e.target.value as ALevelResultsSortKey)
                  }
                  aria-label="Sort results by"
                >
                  {ALEVEL_RESULTS_SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="ms-btn-ghost"
                onClick={() =>
                  setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                }
                title={
                  sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'
                }
                aria-label={`Sort ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
              >
                {sortDir === 'asc' ? (
                  <ArrowUpAZ className="h-4 w-4" />
                ) : (
                  <ArrowDownAZ className="h-4 w-4" />
                )}
              </button>
              <Link href={reportHref} className="ms-btn-secondary">
                <FileText className="h-4 w-4" />
                Report cards
              </Link>
              <button
                type="button"
                onClick={exportCsv}
                className="ms-btn-secondary"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
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

      {(classes ?? []).length === 0 ? (
        <EmptyState
          icon={Award}
          title="No S5 or S6 classes"
          description="A-Level results apply to Advanced-level classes only. Create an S5 or S6 class first."
        />
      ) : !classId || !termId ? (
        <EmptyState
          icon={Award}
          title="Select a class and term"
          description="Then choose an exam to view results."
        />
      ) : !examId ? (
        <EmptyState
          icon={Award}
          title="No exam selected"
          description="Create an exam for this class and term, then select it to view results."
          action={
            <Link href="/dashboard/alevel/exams" className="ms-btn-primary">
              Manage exams
            </Link>
          }
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
        <>
          {summary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-theme-muted">
                  Students
                </p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {summary.studentCount}
                </p>
              </div>
              <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-theme-muted">
                  Avg points
                </p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {summary.averagePoints}
                </p>
              </div>
              <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-theme-muted">
                  Certificate eligible
                </p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {summary.certificateEligible}
                  <span className="ml-2 text-sm font-normal text-theme-muted">
                    ({summary.certificateEligiblePercent}%)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-theme-muted">
                  2+ / 3 principal passes
                </p>
                <p className="mt-1 text-2xl font-semibold text-theme-primary">
                  {summary.twoPrincipalPasses}
                  <span className="ml-2 text-sm font-normal text-theme-muted">
                    / {summary.threePrincipalPasses}
                  </span>
                </p>
              </div>
            </div>
          ) : null}

          {summary?.subjectStats && summary.subjectStats.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
              <div className="border-b border-theme px-4 py-3">
                <h2 className="text-sm font-semibold text-theme-primary">
                  Subject pass rates
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                    <tr>
                      <th className="px-4 py-2 text-left">Subject</th>
                      <th className="px-3 py-2 text-center">Sat</th>
                      <th className="px-3 py-2 text-center">Pass rate</th>
                      <th className="px-3 py-2 text-center">Avg pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.subjectStats.map((s) => (
                      <tr key={s.subjectId} className="border-t border-theme">
                        <td className="px-4 py-2 text-theme-primary">
                          {s.code}{' '}
                          <span className="text-theme-muted">
                            {s.subjectName}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-theme-muted">
                          {s.sat}
                        </td>
                        <td className="px-3 py-2 text-center font-medium text-theme-primary">
                          {s.passRate}%
                        </td>
                        <td className="px-3 py-2 text-center text-theme-muted">
                          {s.averagePoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme px-4 py-2.5 text-xs text-theme-muted">
              <span>
                Showing {sortedResults.length} student
                {sortedResults.length === 1 ? '' : 's'} · sorted by{' '}
                {ALEVEL_RESULTS_SORT_OPTIONS.find((o) => o.key === sortKey)
                  ?.label ?? sortKey}{' '}
                ({sortDir === 'asc' ? 'asc' : 'desc'})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                  <tr>
                    <th className="px-3 py-3 text-left">#</th>
                    <th className="sticky left-0 z-10 bg-table-header px-4 py-3 text-left">
                      Student
                    </th>
                    {subjects.map((s) => (
                      <th
                        key={s.id}
                        className="px-2 py-3 text-center"
                        title={s.name}
                      >
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
                  {sortedResults.map((r) => (
                    <tr
                      key={r.studentId}
                      className="border-t border-theme hover:bg-theme-raised/40"
                    >
                      <td className="px-3 py-2 text-theme-muted">
                        {r.position}
                      </td>
                      <td className="sticky left-0 z-10 bg-theme-surface px-4 py-2">
                        <p className="font-medium text-theme-primary">
                          {r.studentName}
                        </p>
                        <p className="font-mono text-[11px] text-theme-muted">
                          {r.learnerId} · {r.combinationName}
                        </p>
                      </td>
                      {subjects.map((s) => (
                        <td
                          key={s.id}
                          className="px-2 py-2 text-center text-theme-primary"
                        >
                          {gradeFor(r, s.id) || '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center text-theme-primary">
                        {r.best_principal_points}
                      </td>
                      <td className="px-3 py-2 text-center text-theme-muted">
                        {r.gp_points}
                      </td>
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
        </>
      )}
    </div>
  );
}
