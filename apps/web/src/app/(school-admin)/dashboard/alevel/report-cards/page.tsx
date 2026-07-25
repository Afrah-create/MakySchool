'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, FileText, Save } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { useToast } from '@/providers/ToastProvider';
import { useCan } from '@/hooks/useCurrentRole';
import {
  useALevelClasses,
  useALevelReportCard,
  useALevelResults,
  useALevelTerms,
  useGenerateALevelReportCards,
  useSaveALevelReportComment,
} from '@/hooks/useALevel';
import { ClassTermPicker } from '@/components/alevel/ClassTermPicker';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate',
  '2': 'Partial',
  '6': 'Incomplete',
};

function downloadBase64(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const type = filename.endsWith('.zip')
    ? 'application/zip'
    : 'application/pdf';
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportCardsClient() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const canApprove = useCan('viewALevel');

  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();

  const [classId, setClassId] = useState(searchParams.get('classId') ?? '');
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');
  const [studentId, setStudentId] = useState(
    searchParams.get('studentId') ?? '',
  );
  const [classComment, setClassComment] = useState('');
  const [headComment, setHeadComment] = useState('');

  const selectedTerm = (terms ?? []).find((t) => t.id === termId);
  const academicYearId = selectedTerm?.academicYearId ?? '';

  const { data: resultsData } = useALevelResults(
    classId,
    termId,
    academicYearId,
    !!classId && !!termId && !!academicYearId,
  );
  const students = resultsData?.results ?? [];

  useEffect(() => {
    if (!studentId && students.length > 0) {
      setStudentId(students[0].studentId);
    }
  }, [students, studentId]);

  const {
    data: report,
    isPending,
    isError,
    refetch,
  } = useALevelReportCard(
    studentId,
    termId,
    academicYearId,
    !!studentId && !!termId && !!academicYearId,
  );

  const [syncedReport, setSyncedReport] = useState<typeof report>(undefined);
  if (report !== syncedReport) {
    setSyncedReport(report);
    setClassComment(report?.classTeacherComment ?? '');
    setHeadComment(report?.headTeacherComment ?? '');
  }

  const saveComment = useSaveALevelReportComment();
  const generate = useGenerateALevelReportCards();

  const ready = !!classId && !!termId;
  const approved = !!report?.approvedAt;

  async function save(approve = false) {
    if (!studentId) return;
    try {
      await saveComment.mutateAsync({
        studentId,
        termId,
        academicYearId,
        classId,
        classTeacherComment: classComment,
        headTeacherComment: headComment,
        approve,
      });
      toast.success(approve ? 'Report card approved.' : 'Comments saved.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save comments.',
      );
    }
  }

  async function download(one = true) {
    try {
      const result = await generate.mutateAsync({
        classId,
        termId,
        academicYearId,
        studentId: one ? studentId : undefined,
      });
      if (!result.pdfBase64) {
        toast.error('No PDF returned.');
        return;
      }
      downloadBase64(result.filename, result.pdfBase64);
      toast.success(
        one
          ? 'Report card downloaded.'
          : `Downloaded ${result.count ?? 'all'} report cards.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not generate PDF.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level report cards"
        description="Preview term reports, add comments, approve, and download PDFs."
        actions={
          ready && students.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <LoadingButton
                variant="ghost"
                loading={generate.isPending}
                onClick={() => void download(true)}
                disabled={!studentId}
              >
                <Download className="h-4 w-4" />
                PDF
              </LoadingButton>
              <LoadingButton
                variant="primary"
                loading={generate.isPending}
                onClick={() => void download(false)}
              >
                <Download className="h-4 w-4" />
                Class zip
              </LoadingButton>
            </div>
          ) : undefined
        }
      />

      <ClassTermPicker
        classes={classes ?? []}
        terms={terms ?? []}
        classId={classId}
        termId={termId}
        onClassChange={(id) => {
          setClassId(id);
          setStudentId('');
        }}
        onTermChange={(id) => {
          setTermId(id);
          setStudentId('');
        }}
      />

      {!ready ? (
        <EmptyState
          icon={FileText}
          title="Select a class and term"
          description="Choose filters above to open report cards."
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students"
          description="Enroll students and enter grades first."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-theme bg-theme-surface">
            <ul className="divide-y divide-theme">
              {students.map((s) => (
                <li key={s.studentId}>
                  <button
                    type="button"
                    onClick={() => setStudentId(s.studentId)}
                    className={`w-full px-3 py-2.5 text-left text-sm transition ${
                      studentId === s.studentId
                        ? 'bg-theme-accent-muted text-theme-accent'
                        : 'hover:bg-theme-raised/50 text-theme-primary'
                    }`}
                  >
                    <span className="block font-medium">{s.studentName}</span>
                    <span className="block font-mono text-[11px] text-theme-muted">
                      #{s.position} · {s.total_points} pts
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="space-y-4">
            {isPending ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : isError ? (
              <EmptyState
                variant="error"
                title="Couldn’t load report"
                description="Check your connection and try again."
                onRetry={() => void refetch()}
              />
            ) : report ? (
              <>
                <section className="rounded-xl border border-theme bg-theme-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-theme-primary">
                        {report.studentName}
                      </h2>
                      <p className="text-sm text-theme-muted">
                        {report.learnerId} · {report.className} ·{' '}
                        {report.combinationName}
                      </p>
                      <p className="mt-1 text-sm text-theme-muted">
                        {report.termName}
                        {report.position != null
                          ? ` · Position ${report.position}${
                              report.classSize
                                ? ` of ${report.classSize}`
                                : ''
                            }`
                          : ''}
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
                        {RESULT_LABEL[report.result_code] ?? report.result_code}
                      </p>
                      {approved ? (
                        <p className="mt-1 text-xs text-theme-success">
                          Approved
                          {report.approvedByName
                            ? ` by ${report.approvedByName}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
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
                          <tr key={s.subjectId} className="border-t border-theme">
                            <td className="py-2 text-theme-primary">
                              {s.code} {s.subjectName}
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

                <section className="space-y-3 rounded-xl border border-theme bg-theme-surface p-5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-theme-muted">
                      Class teacher comment
                    </span>
                    <textarea
                      className="ms-input min-h-[80px] w-full"
                      value={classComment}
                      disabled={approved}
                      onChange={(e) => setClassComment(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-theme-muted">
                      Head teacher comment
                    </span>
                    <textarea
                      className="ms-input min-h-[80px] w-full"
                      value={headComment}
                      disabled={approved}
                      onChange={(e) => setHeadComment(e.target.value)}
                    />
                  </label>
                  {!approved ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <LoadingButton
                        variant="ghost"
                        loading={saveComment.isPending}
                        onClick={() => void save(false)}
                      >
                        <Save className="h-4 w-4" />
                        Save comments
                      </LoadingButton>
                      {canApprove ? (
                        <LoadingButton
                          variant="primary"
                          loading={saveComment.isPending}
                          onClick={() => void save(true)}
                        >
                          Approve report
                        </LoadingButton>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ALevelReportCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      }
    >
      <ReportCardsClient />
    </Suspense>
  );
}
