'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Download, FileText, Save, Users } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { useToast } from '@/providers/ToastProvider';
import { useCan } from '@/hooks/useCurrentRole';
import {
  useALevelClasses,
  useALevelExams,
  useALevelReportCard,
  useALevelResults,
  useALevelTerms,
  useBulkSaveALevelReportComments,
  useGenerateALevelReportCards,
  useSaveALevelReportComment,
} from '@/hooks/useALevel';
import { ClassExamPicker } from '@/components/alevel/ClassExamPicker';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate',
  '2': 'Partial',
  '6': 'Incomplete',
};

function ReportAvatar({
  photoUrl,
  initials,
  name,
}: {
  photoUrl: string | null | undefined;
  initials: string | undefined;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="h-16 w-16 rounded-2xl object-cover shadow-sm"
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

function ReportCardsClient() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const canApprove = useCan('viewALevel');

  const { data: classes } = useALevelClasses();
  const { data: terms } = useALevelTerms();

  const [classId, setClassId] = useState(searchParams.get('classId') ?? '');
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');
  const [examId, setExamId] = useState(searchParams.get('examId') ?? '');
  const [studentId, setStudentId] = useState(
    searchParams.get('studentId') ?? '',
  );
  const [classComment, setClassComment] = useState('');
  const [headComment, setHeadComment] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClassComment, setBulkClassComment] = useState('');
  const [bulkHeadComment, setBulkHeadComment] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: exams, isPending: examsLoading } = useALevelExams(
    classId && termId ? { classId, termId } : {},
    (!!classId && !!termId) || !!examId,
  );

  useEffect(() => {
    if (!examId || (classId && termId)) return;
    const match = (exams ?? []).find((e) => e.id === examId);
    if (match) {
      setClassId(match.classId);
      setTermId(match.termId);
    }
  }, [examId, exams, classId, termId]);

  useEffect(() => {
    if (!examId || !exams) return;
    if (!exams.some((e) => e.id === examId)) {
      setExamId(exams[0]?.id ?? '');
    }
  }, [exams, examId]);

  const { data: resultsData } = useALevelResults(examId, !!examId);
  const students = resultsData?.results ?? [];

  useEffect(() => {
    if (!studentId && students.length > 0) {
      setStudentId(students[0].studentId);
    }
  }, [students, studentId]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkOpen(false);
  }, [examId]);

  const {
    data: report,
    isPending,
    isError,
    refetch,
  } = useALevelReportCard(studentId, examId, !!studentId && !!examId);

  const [syncedReport, setSyncedReport] = useState<typeof report>(undefined);
  if (report !== syncedReport) {
    setSyncedReport(report);
    setClassComment(report?.classTeacherComment ?? '');
    setHeadComment(report?.headTeacherComment ?? '');
  }

  const saveComment = useSaveALevelReportComment();
  const bulkSave = useBulkSaveALevelReportComments();
  const generate = useGenerateALevelReportCards();

  const ready = !!examId;
  const approved = !!report?.approvedAt;
  const allSelected =
    students.length > 0 && selectedIds.size === students.length;

  const selectedNames = useMemo(() => {
    const names: string[] = [];
    for (const s of students) {
      if (selectedIds.has(s.studentId)) names.push(s.studentName);
    }
    return names;
  }, [students, selectedIds]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(students.map((s) => s.studentId)));
  }

  async function save(approve = false) {
    if (!studentId || !examId) return;
    try {
      await saveComment.mutateAsync({
        studentId,
        examId,
        classTeacherComment: classComment,
        headTeacherComment: headComment,
        approve,
      });
      toast.success(
        approve
          ? 'Report approved. The learner can now view and download it.'
          : 'Comments saved.',
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save comments.',
      );
    }
  }

  async function applyBulk(approve = false) {
    if (!examId || selectedIds.size === 0) return;
    const classText = bulkClassComment.trim();
    const headText = bulkHeadComment.trim();
    if (!classText && !headText && !approve) {
      toast.error('Enter at least one comment, or choose approve.');
      return;
    }
    try {
      const result = await bulkSave.mutateAsync({
        examId,
        studentIds: [...selectedIds],
        classTeacherComment: classText || null,
        headTeacherComment: headText || null,
        approve,
      });
      const parts = [`Updated ${result.saved}`];
      if (result.skippedApproved) {
        parts.push(`skipped ${result.skippedApproved} approved`);
      }
      toast.success(
        approve
          ? `${parts.join(', ')}. Approved reports are visible to learners.`
          : `${parts.join(', ')}.`,
      );
      setBulkOpen(false);
      setBulkClassComment('');
      setBulkHeadComment('');
      if (studentId && selectedIds.has(studentId)) {
        void refetch();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save bulk comments.',
      );
    }
  }

  async function download(one = true) {
    if (!examId) return;
    try {
      const result = await generate.mutateAsync({
        examId,
        studentId: one ? studentId : undefined,
      });
      toast.success(
        one
          ? 'Report card downloaded.'
          : `Downloaded class reports (${result.filename}).`,
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
        description="Preview exam reports, add comments (including bulk), approve for the learner portal, and download PDFs."
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
          setStudentId('');
        }}
        onTermChange={(id) => {
          setTermId(id);
          setExamId('');
          setStudentId('');
        }}
        onExamChange={(id) => {
          setExamId(id);
          setStudentId('');
        }}
        examsLoading={examsLoading}
      />

      {(classes ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No S5 or S6 classes"
          description="A-Level report cards apply to Advanced-level classes only."
        />
      ) : !classId || !termId ? (
        <EmptyState
          icon={FileText}
          title="Select a class and term"
          description="Then choose an exam to open report cards."
        />
      ) : !examId ? (
        <EmptyState
          icon={FileText}
          title="No exam selected"
          description="Create an exam for this class and term, then select it to view report cards."
          action={
            <Link href="/dashboard/alevel/exams" className="ms-btn-primary">
              Manage exams
            </Link>
          }
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students"
          description="Enroll students and enter grades first."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-theme bg-theme-surface">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-theme bg-theme-surface px-3 py-2">
              <label className="flex items-center gap-2 text-xs text-theme-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-theme"
                />
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : 'Select'}
              </label>
              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-theme-accent"
                  onClick={() => setBulkOpen(true)}
                >
                  <Users className="h-3.5 w-3.5" />
                  Bulk comment
                </button>
              ) : null}
            </div>
            <ul className="divide-y divide-theme">
              {students.map((s) => (
                <li key={s.studentId} className="flex items-stretch">
                  <label className="flex items-center px-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.studentId)}
                      onChange={() => toggleSelect(s.studentId)}
                      className="rounded border-theme"
                      aria-label={`Select ${s.studentName}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setStudentId(s.studentId)}
                    className={`min-w-0 flex-1 px-2 py-2.5 text-left text-sm transition ${
                      studentId === s.studentId
                        ? 'bg-theme-accent-muted text-theme-accent'
                        : 'hover:bg-theme-raised/50 text-theme-primary'
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {s.studentName}
                    </span>
                    <span className="block font-mono text-[11px] text-theme-muted">
                      #{s.position} · {s.total_points} pts
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="space-y-4">
            {bulkOpen && selectedIds.size > 0 ? (
              <section className="space-y-3 rounded-xl border border-theme bg-theme-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-theme-primary">
                      Bulk comments
                    </h2>
                    <p className="text-sm text-theme-muted">
                      Apply to {selectedIds.size} student
                      {selectedIds.size === 1 ? '' : 's'}
                      {selectedNames.length <= 3
                        ? `: ${selectedNames.join(', ')}`
                        : ` (e.g. ${selectedNames.slice(0, 2).join(', ')}…)`}
                      . Already-approved reports are skipped unless you approve.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-theme-muted hover:text-theme-primary"
                    onClick={() => setBulkOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-theme-muted">
                    Class teacher comment
                  </span>
                  <textarea
                    className="ms-input min-h-[80px] w-full"
                    value={bulkClassComment}
                    onChange={(e) => setBulkClassComment(e.target.value)}
                    placeholder="Leave blank to keep each student’s existing comment"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-theme-muted">
                    Head teacher comment
                  </span>
                  <textarea
                    className="ms-input min-h-[80px] w-full"
                    value={bulkHeadComment}
                    onChange={(e) => setBulkHeadComment(e.target.value)}
                    placeholder="Leave blank to keep each student’s existing comment"
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <LoadingButton
                    variant="ghost"
                    loading={bulkSave.isPending}
                    onClick={() => void applyBulk(false)}
                  >
                    <Save className="h-4 w-4" />
                    Apply to selected
                  </LoadingButton>
                  {canApprove ? (
                    <LoadingButton
                      variant="primary"
                      loading={bulkSave.isPending}
                      onClick={() => void applyBulk(true)}
                    >
                      Apply &amp; approve
                    </LoadingButton>
                  ) : null}
                </div>
              </section>
            ) : null}

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
                <section className="rounded-2xl border border-theme bg-theme-surface p-5 shadow-sm">
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
                            : ''}{' '}
                          · visible to learner
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-theme-muted">
                          Pending approval
                        </p>
                      )}
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
                        GP / Subsidiary
                      </p>
                      <p className="text-lg font-semibold text-theme-primary">
                        {report.gp_points} / {report.subsidiary_points}
                      </p>
                    </div>
                    <div className="rounded-xl border border-theme bg-theme-raised/40 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-theme-muted">
                        Best principals
                      </p>
                      <p className="text-lg font-semibold text-theme-primary">
                        {report.best_principal_points}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-xl border border-theme">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-theme-raised/50 text-xs uppercase tracking-wide text-theme-muted">
                        <tr>
                          <th className="px-3 py-2.5 text-left">Subject</th>
                          <th className="px-2 py-2.5 text-center">Score</th>
                          <th className="px-2 py-2.5 text-center">Grade</th>
                          <th className="px-2 py-2.5 text-center">Pts</th>
                          <th className="px-3 py-2.5 text-left">Descriptor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.subjects.map((s) => (
                          <tr key={s.subjectId} className="border-t border-theme">
                            <td className="px-3 py-2.5 text-theme-primary">
                              <span className="mr-1.5 font-mono text-xs text-theme-muted">
                                {s.code}
                              </span>
                              {s.subjectName}
                            </td>
                            <td className="px-2 py-2.5 text-center text-theme-muted">
                              {s.rawScore ?? '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center font-semibold text-theme-accent">
                              {s.grade ?? '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {s.points ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-theme-muted">
                              {s.descriptor || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-theme bg-theme-surface p-5">
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
