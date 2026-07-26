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
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
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
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Student roster */}
          <aside className="overflow-hidden rounded-xl border border-theme bg-theme-surface lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-theme bg-table-header px-3 py-2.5">
              <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-theme-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-theme"
                />
                <span className="truncate">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `${students.length} students`}
                </span>
              </label>
              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-theme-accent hover:underline"
                  onClick={() => setBulkOpen(true)}
                >
                  <Users className="h-3.5 w-3.5" />
                  Bulk
                </button>
              ) : null}
            </div>

            {/* Mobile student select */}
            <div className="border-b border-theme p-3 lg:hidden">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                  Student
                </span>
                <select
                  className="ms-input w-full"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  {students.map((s) => (
                    <option key={s.studentId} value={s.studentId}>
                      #{s.position} · {s.studentName} ({s.total_points} pts)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ul className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
              {students.map((s) => {
                const active = studentId === s.studentId;
                return (
                  <li
                    key={s.studentId}
                    className={[
                      'grid grid-cols-[1.75rem_minmax(0,1fr)] items-center border-b border-theme last:border-b-0',
                      active
                        ? 'bg-theme-accent-muted'
                        : 'hover:bg-theme-raised/40',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-center self-stretch pl-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.studentId)}
                        onChange={() => toggleSelect(s.studentId)}
                        className="rounded border-theme"
                        aria-label={`Select ${s.studentName}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudentId(s.studentId)}
                      className={[
                        'min-w-0 px-2 py-2.5 text-left transition',
                        active
                          ? 'border-l-2 border-[var(--color-accent)] text-theme-accent'
                          : 'border-l-2 border-transparent text-theme-primary',
                      ].join(' ')}
                    >
                      <span className="block truncate text-sm font-medium">
                        {s.studentName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-theme-muted">
                        <span className="tabular-nums">#{s.position}</span>
                        <span className="text-theme-faint">·</span>
                        <span className="tabular-nums">{s.total_points} pts</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0 space-y-4">
            {bulkOpen && selectedIds.size > 0 ? (
              <section className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-theme px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-theme-primary">
                      Bulk comments
                    </h2>
                    <p className="mt-0.5 text-xs text-theme-muted">
                      Apply to {selectedIds.size} student
                      {selectedIds.size === 1 ? '' : 's'}
                      {selectedNames.length <= 3
                        ? `: ${selectedNames.join(', ')}`
                        : ` (e.g. ${selectedNames.slice(0, 2).join(', ')}…)`}
                      . Approved reports are skipped unless you approve.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ms-btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
                    onClick={() => setBulkOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                      Class teacher comment
                    </span>
                    <textarea
                      className="ms-input min-h-[88px] w-full"
                      value={bulkClassComment}
                      onChange={(e) => setBulkClassComment(e.target.value)}
                      placeholder="Leave blank to keep existing"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                      Head teacher comment
                    </span>
                    <textarea
                      className="ms-input min-h-[88px] w-full"
                      value={bulkHeadComment}
                      onChange={(e) => setBulkHeadComment(e.target.value)}
                      placeholder="Leave blank to keep existing"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-theme px-4 py-3 sm:px-5">
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
                <section className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                  {/* Identity header */}
                  <div className="border-b border-theme px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3.5">
                        <ReportAvatar
                          photoUrl={report.photoUrl}
                          initials={report.studentInitials}
                          name={report.studentName}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-lg font-semibold text-theme-primary">
                              {report.studentName}
                            </h2>
                            {approved ? (
                              <span className="badge-success rounded-full px-2 py-0.5 text-[11px] font-medium">
                                Approved
                              </span>
                            ) : (
                              <span className="rounded-full bg-theme-raised px-2 py-0.5 text-[11px] font-medium text-theme-muted">
                                Pending approval
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-theme-muted">
                            {report.learnerId}
                          </p>
                          {approved && report.approvedByName ? (
                            <p className="mt-1 text-xs text-theme-success">
                              Approved by {report.approvedByName} · visible to
                              learner
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-theme bg-theme-raised/40 px-4 py-2.5 sm:flex-col sm:items-end sm:gap-1 sm:self-auto">
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
                        value={[
                          report.examName,
                          report.examTypeName,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <MetaChip
                        label="Position"
                        value={
                          report.position != null
                            ? `${report.position}${
                                report.classSize
                                  ? ` of ${report.classSize}`
                                  : ''
                              }`
                            : '—'
                        }
                      />
                    </dl>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-3 border-b border-theme px-4 py-4 sm:px-5">
                    <KpiTile
                      label="Principal passes"
                      value={report.principal_pass_count}
                    />
                    <KpiTile
                      label="GP / Subsidiary"
                      value={`${report.gp_points} / ${report.subsidiary_points}`}
                    />
                    <KpiTile
                      label="Best principals"
                      value={report.best_principal_points}
                    />
                  </div>

                  {/* Subjects */}
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

                <section className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                  <div className="border-b border-theme px-4 py-3 sm:px-5">
                    <h3 className="text-sm font-semibold text-theme-primary">
                      Comments
                    </h3>
                    <p className="text-xs text-theme-muted">
                      {approved
                        ? 'This report is approved and locked for editing.'
                        : 'Add remarks before approving for the learner portal.'}
                    </p>
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                        Class teacher
                      </span>
                      <textarea
                        className="ms-input min-h-[96px] w-full"
                        value={classComment}
                        disabled={approved}
                        onChange={(e) => setClassComment(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                        Head teacher
                      </span>
                      <textarea
                        className="ms-input min-h-[96px] w-full"
                        value={headComment}
                        disabled={approved}
                        onChange={(e) => setHeadComment(e.target.value)}
                      />
                    </label>
                  </div>
                  {!approved ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-theme px-4 py-3 sm:px-5">
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
        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      }
    >
      <ReportCardsClient />
    </Suspense>
  );
}
