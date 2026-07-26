'use client';

import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { DashboardPage } from '@makyschool/ui/components/layout/DashboardPage';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { QueryState } from '@makyschool/ui/components/ui/QueryState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { useToast } from '@/providers/ToastProvider';
import {
  useDownloadLearnerReportPdf,
  useLearnerApprovedReport,
  useLearnerApprovedReports,
} from '@/hooks/useLearnerALevel';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate eligible',
  '2': 'Partial pass',
  '6': 'Incomplete',
};

const RESULT_BADGE: Record<string, string> = {
  '1': 'badge-success',
  '2': 'badge-warning',
  '6': 'bg-theme-raised text-theme-muted',
};

function ReportAvatar({
  photoUrl,
  initials,
  name,
}: {
  photoUrl: string | null;
  initials: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-base font-semibold text-theme-accent sm:h-16 sm:w-16 sm:text-lg">
      {initials || '?'}
    </span>
  );
}

function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-theme-faint">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-theme-primary">
        {value || '—'}
      </dd>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-theme bg-theme-raised/40 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-theme-primary">
        {value}
      </p>
    </div>
  );
}

export function LearnerReportCardsContent() {
  const { toast } = useToast();
  const {
    data: reports,
    error,
    isLoading,
    refetch: refetchList,
  } = useLearnerApprovedReports();
  const [examId, setExamId] = useState('');
  const selectedId = examId || reports?.[0]?.examId || '';

  const {
    data: report,
    isPending: reportLoading,
    isError: reportError,
    refetch,
  } = useLearnerApprovedReport(selectedId, !!selectedId);

  const download = useDownloadLearnerReportPdf();

  const selectedSummary = useMemo(
    () => (reports ?? []).find((r) => r.examId === selectedId),
    [reports, selectedId],
  );

  async function onDownload() {
    if (!selectedId) return;
    try {
      await download.mutateAsync(selectedId);
      toast.success('Report card downloaded.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not download report.',
      );
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Learner portal"
      title="Report cards"
      description="View and download approved A-Level examination reports."
      actions={
        selectedId ? (
          <LoadingButton
            variant="primary"
            loading={download.isPending}
            onClick={() => void onDownload()}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </LoadingButton>
        ) : undefined
      }
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={reports}
        onRetry={() => void refetchList()}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        }
        isEmpty={(items) => !items || items.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title="No approved reports yet"
            description="When your school approves an A-Level report card, it will appear here for download."
          />
        }
      >
        {(items) => (
          <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-xl border border-theme bg-theme-surface lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
              <div className="shrink-0 border-b border-theme bg-table-header px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
                  Approved exams
                </p>
              </div>

              <div className="border-b border-theme p-3 lg:hidden">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                    Exam
                  </span>
                  <select
                    className="ms-input w-full"
                    value={selectedId}
                    onChange={(e) => setExamId(e.target.value)}
                  >
                    {items.map((item) => (
                      <option key={item.examId} value={item.examId}>
                        {item.examName}
                        {item.termName ? ` · ${item.termName}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
                {items.map((item) => {
                  const active = selectedId === item.examId;
                  return (
                    <li key={item.examId} className="border-b border-theme last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setExamId(item.examId)}
                        className={[
                          'w-full px-3 py-3 text-left text-sm transition',
                          active
                            ? 'border-l-2 border-[var(--color-accent)] bg-theme-accent-muted text-theme-accent'
                            : 'border-l-2 border-transparent hover:bg-theme-raised/40 text-theme-primary',
                        ].join(' ')}
                      >
                        <span className="block truncate font-medium">
                          {item.examName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-theme-muted">
                          {item.termName}
                          {item.academicYearLabel
                            ? ` · ${item.academicYearLabel}`
                            : ''}
                        </span>
                        <span className="mt-1 block font-mono text-[11px] tabular-nums text-theme-muted">
                          {item.total_points} pts ·{' '}
                          {RESULT_LABEL[item.result_code] ?? item.result_code}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="min-w-0 space-y-4">
              {reportLoading ? (
                <Skeleton className="h-96 w-full rounded-xl" />
              ) : reportError ? (
                <EmptyState
                  variant="error"
                  title="Couldn’t load report"
                  description="Check your connection and try again."
                  onRetry={() => void refetch()}
                />
              ) : report ? (
                <>
                  <section className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                    <div className="border-b border-theme px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <ReportAvatar
                            photoUrl={report.photoUrl}
                            initials={report.studentInitials}
                            name={report.studentName}
                          />
                          <div className="min-w-0">
                            <h2 className="truncate text-lg font-semibold text-theme-primary">
                              {report.studentName}
                            </h2>
                            <p className="mt-0.5 font-mono text-xs text-theme-muted">
                              {report.learnerId}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-theme bg-theme-raised/40 px-4 py-2.5 sm:flex-col sm:items-end sm:gap-1">
                          <p className="text-2xl font-semibold tabular-nums leading-none text-theme-primary">
                            {report.total_points}
                            <span className="ml-1 text-sm font-normal text-theme-muted">
                              pts
                            </span>
                          </p>
                          <span
                            className={[
                              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                              RESULT_BADGE[report.result_code] ??
                                'bg-theme-raised text-theme-muted',
                            ].join(' ')}
                          >
                            {RESULT_LABEL[report.result_code] ??
                              report.result_code}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-theme pt-4 sm:grid-cols-4">
                        <MetaChip label="Class" value={report.className} />
                        <MetaChip
                          label="Combination"
                          value={report.combinationName}
                        />
                        <MetaChip
                          label="Exam"
                          value={
                            selectedSummary?.examTypeName || report.examName
                          }
                        />
                        <MetaChip
                          label="Position"
                          value={
                            report.position != null && report.classSize
                              ? `${report.position} of ${report.classSize}`
                              : report.position != null
                                ? String(report.position)
                                : '—'
                          }
                        />
                      </dl>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-b border-theme px-4 py-4 sm:px-5">
                      <KpiTile
                        label="Principal passes"
                        value={report.principal_pass_count}
                      />
                      <KpiTile
                        label="Class rank"
                        value={
                          report.position != null && report.classSize
                            ? `${report.position} of ${report.classSize}`
                            : '—'
                        }
                      />
                      <KpiTile
                        label="Term"
                        value={report.termName || '—'}
                      />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="ms-table ms-table-compact w-full min-w-[32rem]">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th className="text-center">Score</th>
                            <th className="text-center">Grade</th>
                            <th className="text-center">Pts</th>
                            <th>Descriptor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.subjects.map((s) => (
                            <tr key={s.subjectId}>
                              <td>
                                <div className="flex items-baseline gap-2">
                                  <span className="shrink-0 font-mono text-xs text-theme-muted">
                                    {s.code}
                                  </span>
                                  <span className="font-medium text-theme-primary">
                                    {s.subjectName}
                                  </span>
                                </div>
                              </td>
                              <td className="text-center tabular-nums text-theme-muted">
                                {s.rawScore ?? '—'}
                              </td>
                              <td className="text-center font-semibold tabular-nums text-theme-accent">
                                {s.grade ?? '—'}
                              </td>
                              <td className="text-center tabular-nums text-theme-primary">
                                {s.points ?? '—'}
                              </td>
                              <td className="text-muted">
                                {s.descriptor || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                        Class teacher comment
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-theme-primary">
                        {report.classTeacherComment || '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                        Head teacher comment
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-theme-primary">
                        {report.headTeacherComment || '—'}
                      </p>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        )}
      </QueryState>
    </DashboardPage>
  );
}
