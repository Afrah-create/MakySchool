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
        className="h-16 w-16 rounded-2xl object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-accent-muted text-lg font-semibold text-theme-accent">
      {initials || '?'}
    </span>
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
      maxWidth="5xl"
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
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
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
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="max-h-[70vh] overflow-y-auto rounded-2xl border border-theme bg-theme-surface">
              <ul className="divide-y divide-theme">
                {items.map((item) => (
                  <li key={item.examId}>
                    <button
                      type="button"
                      onClick={() => setExamId(item.examId)}
                      className={`w-full px-3 py-3 text-left text-sm transition ${
                        selectedId === item.examId
                          ? 'bg-theme-accent-muted text-theme-accent'
                          : 'hover:bg-theme-raised/50 text-theme-primary'
                      }`}
                    >
                      <span className="block font-medium">{item.examName}</span>
                      <span className="mt-0.5 block text-xs text-theme-muted">
                        {item.termName}
                        {item.academicYearLabel
                          ? ` · ${item.academicYearLabel}`
                          : ''}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-theme-muted">
                        {item.total_points} pts ·{' '}
                        {RESULT_LABEL[item.result_code] ?? item.result_code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="space-y-4">
              {reportLoading ? (
                <Skeleton className="h-96 w-full rounded-2xl" />
              ) : reportError ? (
                <EmptyState
                  variant="error"
                  title="Couldn’t load report"
                  description="Check your connection and try again."
                  onRetry={() => void refetch()}
                />
              ) : report ? (
                <>
                  <section className="rounded-2xl border border-theme bg-theme-surface p-5">
                    <div className="flex flex-wrap items-start gap-4">
                      <ReportAvatar
                        photoUrl={report.photoUrl}
                        initials={report.studentInitials}
                        name={report.studentName}
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-theme-primary">
                          {report.studentName}
                        </h2>
                        <p className="text-sm text-theme-muted">
                          {report.learnerId} · {report.className} ·{' '}
                          {report.combinationName}
                        </p>
                        <p className="mt-1 text-sm text-theme-muted">
                          {report.examName}
                          {report.examTypeName
                            ? ` · ${report.examTypeName}`
                            : ''}
                          {report.termName ? ` · ${report.termName}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-theme-primary">
                          {report.total_points}
                          <span className="ml-1 text-sm font-normal text-theme-muted">
                            pts
                          </span>
                        </p>
                        <p className="text-sm text-theme-accent">
                          {RESULT_LABEL[report.result_code] ??
                            report.result_code}
                        </p>
                        {report.approvedAt ? (
                          <p className="mt-1 text-xs text-theme-success">
                            Approved
                            {report.approvedByName
                              ? ` by ${report.approvedByName}`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-theme bg-theme-raised/40 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-theme-muted">
                          Principal passes
                        </p>
                        <p className="text-lg font-semibold text-theme-primary">
                          {report.principal_pass_count}
                        </p>
                      </div>
                      <div className="rounded-xl border border-theme bg-theme-raised/40 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-theme-muted">
                          Class rank
                        </p>
                        <p className="text-lg font-semibold text-theme-primary">
                          {report.position != null && report.classSize
                            ? `${report.position} of ${report.classSize}`
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-theme bg-theme-raised/40 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-theme-muted">
                          Exam
                        </p>
                        <p className="truncate text-sm font-semibold text-theme-primary">
                          {selectedSummary?.examTypeName || report.examName}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead className="text-xs uppercase tracking-wide text-theme-muted">
                          <tr>
                            <th className="py-2 text-left">Subject</th>
                            <th className="px-2 py-2 text-center">Score</th>
                            <th className="px-2 py-2 text-center">Grade</th>
                            <th className="px-2 py-2 text-center">Pts</th>
                            <th className="py-2 text-left">Descriptor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.subjects.map((s) => (
                            <tr
                              key={s.subjectId}
                              className="border-t border-theme"
                            >
                              <td className="py-2 text-theme-primary">
                                <span className="mr-1 font-mono text-xs text-theme-muted">
                                  {s.code}
                                </span>
                                {s.subjectName}
                              </td>
                              <td className="px-2 py-2 text-center text-theme-muted">
                                {s.rawScore ?? '—'}
                              </td>
                              <td className="px-2 py-2 text-center font-medium">
                                {s.grade ?? '—'}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {s.points ?? '—'}
                              </td>
                              <td className="py-2 text-theme-muted">
                                {s.descriptor || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-theme bg-theme-surface p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
                        Class teacher comment
                      </h3>
                      <p className="mt-2 text-sm text-theme-primary whitespace-pre-wrap">
                        {report.classTeacherComment || '—'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-theme bg-theme-surface p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
                        Head teacher comment
                      </h3>
                      <p className="mt-2 text-sm text-theme-primary whitespace-pre-wrap">
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
