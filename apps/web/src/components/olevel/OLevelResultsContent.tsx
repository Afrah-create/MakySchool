"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import {
  ChevronDown,
  Download,
  FileArchive,
  FileSpreadsheet,
} from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { PAGE_SIZE_OPTIONS } from "@makyschool/shared/constants";
import type { OLevelExamSession, OLevelStudentResult } from "@makyschool/shared";
import { olevelApi } from "@/lib/api/olevel";
import { exportOLevelResultsCsv } from "@/lib/olevel/exportResultsCsv";
import { defaultClassAndYear } from "@/lib/olevel/registration";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  useApproveOLevelResults,
  useGenerateOLevelResults,
  useOLevelClassResults,
  useOLevelClasses,
  useOLevelExamSessions,
  useOLevelTerms,
  useRankOLevelClass,
} from "@/hooks/useOLevel";
import { useToast } from "@/providers/ToastProvider";

type Banner = { tone: "success" | "error" | "info"; message: string };
type PipelineAction = "generate" | "rank" | "approve" | null;

function isExamCategory(s: OLevelExamSession) {
  const code = (s.categoryCode || "").toUpperCase();
  if (code === "EXAM" || code === "EOT" || code === "EOE") return true;
  if (code === "CA" || code === "CASS" || code === "ASSESSMENT") return false;
  const name = (s.categoryName || "").toLowerCase();
  if (name.includes("end") || name.includes("exam") || name.includes("term exam")) {
    return true;
  }
  if (name.includes("continuous") || name.includes("assessment") || name.includes("ca ")) {
    return false;
  }
  const weight = Number(s.categoryWeightPercent ?? 0);
  return weight >= 50;
}

export function OLevelResultsContent() {
  const { toast } = useToast();
  const { data: classes = [], isSuccess: classesReady } = useOLevelClasses();
  const { data: terms = [], isSuccess: termsReady } = useOLevelTerms();
  const defaults = useMemo(() => defaultClassAndYear(classes, terms), [classes, terms]);

  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirm, setConfirm] = useState<PipelineAction>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [classComment, setClassComment] = useState("");
  const [headComment, setHeadComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [assessmentSessionIds, setAssessmentSessionIds] = useState<string[]>([]);
  const [examSessionId, setExamSessionId] = useState("");
  const [selectionHydrated, setSelectionHydrated] = useState(false);

  useEffect(() => {
    if (defaultsApplied) return;
    if (!classesReady || !termsReady) return;
    setClassId(defaults.classId);
    setTermId(defaults.termId);
    setDefaultsApplied(true);
  }, [defaults, defaultsApplied, classesReady, termsReady]);

  useEffect(() => {
    setCheckedIds([]);
    setExpanded(null);
    setQuery("");
    setAssessmentSessionIds([]);
    setExamSessionId("");
    setSelectionHydrated(false);
  }, [classId, termId]);

  const selectedTerm = terms.find((t) => t.id === termId);
  const yearId = selectedTerm?.academicYearId ?? "";
  const selectedClass = classes.find((c) => c.id === classId);

  const { data: sessions = [], isFetched: sessionsFetched, isFetching: sessionsFetching } =
    useOLevelExamSessions(
      { classId, termId },
      !!classId && !!termId,
    );

  const activeSessions = useMemo(
    () => sessions.filter((s) => !s.deleted),
    [sessions],
  );

  const assessmentSessions = useMemo(
    () => activeSessions.filter((s) => !isExamCategory(s)),
    [activeSessions],
  );
  const examSessions = useMemo(
    () => activeSessions.filter((s) => isExamCategory(s)),
    [activeSessions],
  );

  const sessionsKey = useMemo(
    () => activeSessions.map((s) => `${s.id}:${s.categoryCode ?? ""}`).join("|"),
    [activeSessions],
  );

  // Prefer saved selection; otherwise select all CAs + first exam.
  useEffect(() => {
    if (!classId || !termId || !yearId || !sessionsFetched || sessionsFetching) return;
    let cancelled = false;
    void (async () => {
      let savedAssess: string[] = [];
      let savedExam = "";
      try {
        const saved = await olevelApi.getGradingSelection(classId, termId, yearId);
        savedAssess = saved?.assessmentSessionIds ?? [];
        savedExam = saved?.examSessionId ?? "";
      } catch {
        /* no saved selection yet */
      }
      if (cancelled) return;
      const assessPool = activeSessions.filter((s) => !isExamCategory(s));
      const examPool = activeSessions.filter((s) => isExamCategory(s));
      const assessIds = savedAssess.filter((id) => assessPool.some((s) => s.id === id));
      setAssessmentSessionIds(
        assessIds.length ? assessIds : assessPool.map((s) => s.id),
      );
      setExamSessionId(
        savedExam && examPool.some((s) => s.id === savedExam)
          ? savedExam
          : (examPool[0]?.id ?? ""),
      );
      setSelectionHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // sessionsKey captures session identity; avoid looping on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, termId, yearId, sessionsFetched, sessionsFetching, sessionsKey]);

  const { data: results, refetch, isFetching, isError, error } = useOLevelClassResults(
    classId,
    termId,
    yearId,
  );
  const students = useMemo(() => results?.students ?? [], [results]);
  const summary = results?.summary;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.studentName ?? "").toLowerCase().includes(q) ||
        (s.learnerId ?? "").toLowerCase().includes(q),
    );
  }, [students, query]);

  const { paged, page, setPage, pageSize, setPageSize, total } = useClientPagination({
    items: filtered,
    resetDeps: [classId, termId, query],
  });

  const generate = useGenerateOLevelResults();
  const rank = useRankOLevelClass();
  const approve = useApproveOLevelResults();
  const payload = { classId, termId, academicYearId: yearId };
  const canGenerate =
    !!classId &&
    !!termId &&
    !!yearId &&
    assessmentSessionIds.length > 0 &&
    !!examSessionId;

  function show(tone: Banner["tone"], message: string) {
    setBanner({ tone, message });
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message);
    else toast.info(message);
  }

  async function runConfirmed() {
    if (!confirm) return;
    if (!classId || !termId || !yearId) {
      show("error", "Choose class and term first.");
      setConfirm(null);
      return;
    }
    if (confirm === "generate") {
      if (!assessmentSessionIds.length || !examSessionId) {
        show(
          "error",
          "Select at least one continuous assessment and one end-of-term exam.",
        );
        setConfirm(null);
        return;
      }
    }
    setBusyAction(true);
    setBanner(null);
    try {
      if (confirm === "generate") {
        const r = await generate.mutateAsync({
          ...payload,
          examSessionId,
          assessmentSessionIds,
        });
        const failed = r.failed ?? 0;
        if (failed > 0) {
          show(
            "info",
            `Generated ${r.calculated} result(s), ranked ${r.ranked}. ${failed} student(s) could not be graded.`,
          );
        } else {
          show(
            "success",
            `Results generated for ${r.calculated} student(s); rankings updated for ${r.ranked}.`,
          );
        }
      } else if (confirm === "rank") {
        const r = await rank.mutateAsync(payload);
        show("success", `Rankings updated for ${r.updated} student(s).`);
      } else {
        const r = await approve.mutateAsync(payload);
        if (!r.approved) {
          show("error", "No results to approve. Generate results first.");
        } else {
          show("success", `Approved ${r.approved} result(s).`);
        }
      }
      setConfirm(null);
      await refetch();
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyAction(false);
    }
  }

  async function downloadStudent(enrollmentId: string, name?: string) {
    if (!termId || !yearId) {
      show("error", "Choose class and term first.");
      return;
    }
    try {
      const { downloadBinaryFile } = await import("@/lib/api/downloadBinary");
      await downloadBinaryFile(
        `/api/schools/olevel/report-cards/student?enrollment_id=${enrollmentId}&term_id=${termId}&academic_year_id=${yearId}`,
        {
          fallbackFilename: `${(name || "student").replace(/\s+/g, "-")}-olevel-report.pdf`,
        },
      );
      show("success", "Report card downloaded.");
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Download failed.");
    }
  }

  async function downloadClassZip() {
    if (!classId || !termId || !yearId) {
      show("error", "Choose class and term first.");
      return;
    }
    setZipBusy(true);
    try {
      const { downloadBinaryFile } = await import("@/lib/api/downloadBinary");
      await downloadBinaryFile(`/api/schools/olevel/report-cards/class`, {
        method: "POST",
        body: { classId, termId, academicYearId: yearId },
        fallbackFilename: `olevel-reports-${selectedClass?.name?.replace(/\s+/g, "-") || "class"}.zip`,
      });
      show("success", "Class report ZIP downloaded.");
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Could not download class reports.");
    } finally {
      setZipBusy(false);
    }
  }

  async function applyBulkComments(alsoApprove: boolean) {
    if (!checkedIds.length) {
      show("error", "Select at least one student.");
      return;
    }
    if (!classComment.trim() && !headComment.trim() && !alsoApprove) {
      show("error", "Enter a comment or choose Approve with comments.");
      return;
    }
    setCommentBusy(true);
    try {
      const r = await olevelApi.saveCommentsBulk({
        enrollmentIds: checkedIds,
        termId,
        academicYearId: yearId,
        classTeacherComment: classComment.trim() || undefined,
        headTeacherComment: headComment.trim() || undefined,
        approve: alsoApprove,
      });
      show(
        "success",
        alsoApprove
          ? `Comments saved for ${r.saved}; approved ${r.approved}.`
          : `Comments saved for ${r.saved} student(s).`,
      );
      setCheckedIds([]);
      void refetch();
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Could not save comments.");
    } finally {
      setCommentBusy(false);
    }
  }

  const confirmCopy: Record<
    Exclude<PipelineAction, null>,
    { title: string; description: string; label: string }
  > = {
    generate: {
      title: "Generate class results?",
      description: `Averages ${assessmentSessionIds.length} assessment session(s) (20%), combines with the selected end-of-term exam (80%), then ranks the class. Missing marks count as zero. Existing approvals will be cleared.`,
      label: "Generate results",
    },
    rank: {
      title: "Recalculate rankings only?",
      description:
        "Positions will be recomputed from existing result totals without re-grading marks.",
      label: "Calculate rankings",
    },
    approve: {
      title: "Approve class results?",
      description:
        "Marks all current results for this class and term as approved. Report cards should be ready before approval.",
      label: "Approve results",
    },
  };

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Results"
      description="Generate grades and rankings, add comments, approve, then download report cards."
    >
      <div className="space-y-5">
        {banner ? (
          <StatusBanner
            tone={banner.tone}
            message={banner.message}
            onDismiss={() => setBanner(null)}
            autoDismissMs={banner.tone === "success" ? 5000 : undefined}
          />
        ) : null}

        <section className="rounded-xl border border-theme bg-theme-surface p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-theme-muted">
              Class
              <select
                className="ms-input mt-1 block min-w-40"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">Choose class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-theme-muted">
              Term
              <select
                className="ms-input mt-1 block min-w-48"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">Choose term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.academicYearName}
                    {t.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {classId && termId ? (
            <div className="grid gap-4 rounded-lg border border-theme bg-theme-raised/40 p-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-theme-primary">
                    Continuous assessments (20%)
                  </h3>
                  <button
                    type="button"
                    className="text-xs text-theme-accent"
                    onClick={() =>
                      setAssessmentSessionIds(
                        assessmentSessionIds.length === assessmentSessions.length
                          ? []
                          : assessmentSessions.map((s) => s.id),
                      )
                    }
                  >
                    {assessmentSessionIds.length === assessmentSessions.length
                      ? "Clear"
                      : "Select all"}
                  </button>
                </div>
                <p className="text-xs text-theme-muted">
                  If several are selected, their percentages are averaged. Missing marks
                  count as 0.
                </p>
                {sessionsFetching && !selectionHydrated ? (
                  <p className="text-sm text-theme-muted">Loading sessions…</p>
                ) : !assessmentSessions.length ? (
                  <p className="text-sm text-theme-muted">
                    No CA sessions for this class/term yet. Create Continuous Assessment
                    sessions under Exam sessions.
                    {activeSessions.length > 0
                      ? ` (${activeSessions.length} other session(s) found — check their category).`
                      : ""}
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                    {assessmentSessions.map((s) => (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={assessmentSessionIds.includes(s.id)}
                            onChange={(e) =>
                              setAssessmentSessionIds((prev) =>
                                e.target.checked
                                  ? [...prev, s.id]
                                  : prev.filter((id) => id !== s.id),
                              )
                            }
                          />
                          <span>
                            <span className="font-medium text-theme-primary">{s.title}</span>
                            <span className="block text-xs text-theme-muted">
                              {s.categoryName || s.categoryCode || "CA"} · /{s.maxMarks} ·{" "}
                              {s.status}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-theme-primary">
                  End-of-term exam (80%)
                </h3>
                <p className="text-xs text-theme-muted">
                  Choose the final paper that contributes 80% of each subject total.
                </p>
                {sessionsFetching && !selectionHydrated ? (
                  <p className="text-sm text-theme-muted">Loading sessions…</p>
                ) : !examSessions.length ? (
                  <p className="text-sm text-theme-muted">
                    No end-of-term exam session for this class/term yet. Create an
                    End-of-Term Exam session under Exam sessions.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                    {examSessions.map((s) => (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="radio"
                            name="olevel-exam-session"
                            className="mt-0.5"
                            checked={examSessionId === s.id}
                            onChange={() => setExamSessionId(s.id)}
                          />
                          <span>
                            <span className="font-medium text-theme-primary">{s.title}</span>
                            <span className="block text-xs text-theme-muted">
                              {s.categoryName || s.categoryCode || "Exam"} · /{s.maxMarks} ·{" "}
                              {s.status}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <LoadingButton
              type="button"
              loading={busyAction && confirm === "generate"}
              disabled={!canGenerate || busyAction}
              onClick={() => setConfirm("generate")}
            >
              Generate results
            </LoadingButton>
            <LoadingButton
              type="button"
              variant="ghost"
              loading={busyAction && confirm === "rank"}
              disabled={!classId || !termId || !yearId || !students.length || busyAction}
              onClick={() => setConfirm("rank")}
            >
              Recalculate rankings
            </LoadingButton>
            <LoadingButton
              type="button"
              variant="ghost"
              loading={busyAction && confirm === "approve"}
              disabled={!classId || !termId || !yearId || !students.length || busyAction}
              onClick={() => setConfirm("approve")}
            >
              Approve class
            </LoadingButton>
            <LoadingButton
              type="button"
              variant="ghost"
              disabled={!students.length}
              onClick={() =>
                exportOLevelResultsCsv({
                  className: selectedClass?.name ?? "class",
                  termName: selectedTerm?.name ?? "term",
                  academicYearName: selectedTerm?.academicYearName ?? "",
                  students,
                })
              }
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </LoadingButton>
            <LoadingButton
              type="button"
              variant="ghost"
              loading={zipBusy}
              disabled={!students.length || !yearId || zipBusy}
              onClick={() => void downloadClassZip()}
            >
              <FileArchive className="h-4 w-4" />
              Download class ZIP
            </LoadingButton>
          </div>

          <p className="text-xs text-theme-muted">
            Pipeline: enter &amp; submit marks → select assessments + exam →{" "}
            <strong>Generate results</strong> → comments → <strong>Approve</strong> →
            download reports.
            {isFetching ? " · Refreshing…" : ""}
          </p>
        </section>

        {summary && students.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Students with results" value={summary.studentCount} />
            <Stat
              label="Class average"
              value={`${Number(summary.averagePercent ?? 0).toFixed(1)}%`}
            />
            <Stat label="Promoted" value={`${summary.promotedCount}/${summary.studentCount}`} />
            <Stat label="Approved" value={`${summary.approvedCount}/${summary.studentCount}`} />
          </div>
        ) : null}

        {students.length ? (
          <section className="rounded-xl border border-theme bg-theme-surface p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-theme-primary">
                Bulk comments ({checkedIds.length} selected)
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-theme-raised px-3 py-1.5 text-sm"
                  onClick={() => setCheckedIds(students.map((s) => s.enrollmentId))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-theme-raised px-3 py-1.5 text-sm"
                  onClick={() => setCheckedIds([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-theme-muted">
                Class teacher comment
                <textarea
                  className="ms-input mt-1 min-h-20 w-full"
                  value={classComment}
                  onChange={(e) => setClassComment(e.target.value)}
                  placeholder="Applied to selected students"
                />
              </label>
              <label className="text-sm text-theme-muted">
                Head teacher comment
                <textarea
                  className="ms-input mt-1 min-h-20 w-full"
                  value={headComment}
                  onChange={(e) => setHeadComment(e.target.value)}
                  placeholder="Admin / head teacher only"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <LoadingButton
                loading={commentBusy}
                disabled={!checkedIds.length}
                onClick={() => void applyBulkComments(false)}
              >
                Apply comments
              </LoadingButton>
              <LoadingButton
                variant="ghost"
                loading={commentBusy}
                disabled={!checkedIds.length}
                onClick={() => void applyBulkComments(true)}
              >
                Apply &amp; approve selected
              </LoadingButton>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            className="ms-input w-full sm:max-w-xs"
            placeholder="Search student…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!students.length}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-theme-muted">
              <tr>
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    aria-label="Select page"
                    checked={
                      paged.length > 0 &&
                      paged.every((s) => checkedIds.includes(s.enrollmentId))
                    }
                    onChange={(e) => {
                      const ids = paged.map((s) => s.enrollmentId);
                      setCheckedIds((prev) =>
                        e.target.checked
                          ? Array.from(new Set([...prev, ...ids]))
                          : prev.filter((id) => !ids.includes(id)),
                      );
                    }}
                  />
                </th>
                <th className="p-3 text-left">Pos</th>
                <th className="p-3 text-left">Student</th>
                <th className="p-3 text-left">Points</th>
                <th className="p-3 text-left">Average</th>
                <th className="p-3 text-left">Promoted</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-theme-muted">
                    {error instanceof Error ? error.message : "Could not load results."}{" "}
                    <button
                      type="button"
                      className="text-theme-accent"
                      onClick={() => void refetch()}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : !students.length ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-theme-muted">
                    {classId && termId
                      ? "No results yet. Submit subject marks, then use Generate results."
                      : "Choose a class and term to begin."}
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <ResultRow
                    key={r.id}
                    result={r}
                    checked={checkedIds.includes(r.enrollmentId)}
                    expanded={expanded === r.id}
                    onCheck={() =>
                      setCheckedIds((prev) =>
                        prev.includes(r.enrollmentId)
                          ? prev.filter((id) => id !== r.enrollmentId)
                          : [...prev, r.enrollmentId],
                      )
                    }
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    onDownload={() => void downloadStudent(r.enrollmentId, r.studentName)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          noun="students"
        />
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? confirmCopy[confirm].title : ""}
        description={confirm ? confirmCopy[confirm].description : ""}
        confirmLabel={confirm ? confirmCopy[confirm].label : "Confirm"}
        loading={busyAction}
        onCancel={() => {
          if (!busyAction) setConfirm(null);
        }}
        onConfirm={() => void runConfirmed()}
      />
    </DashboardPage>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
      <p className="text-xs text-theme-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-theme-primary">{value}</p>
    </div>
  );
}

function ResultRow({
  result,
  checked,
  expanded,
  onCheck,
  onToggle,
  onDownload,
}: {
  result: OLevelStudentResult;
  checked: boolean;
  expanded: boolean;
  onCheck: () => void;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const approved = Boolean(result.approvedAt);
  return (
    <Fragment>
      <tr className="border-t border-theme">
        <td className="p-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            aria-label={`Select ${result.studentName}`}
          />
        </td>
        <td className="p-3 tabular-nums">
          {result.classPosition ?? "—"}
          {result.totalStudentsInClass ? `/${result.totalStudentsInClass}` : ""}
        </td>
        <td className="p-3">
          <div className="font-medium text-theme-primary">{result.studentName}</div>
          <div className="text-xs text-theme-muted">{result.learnerId || "No student ID"}</div>
        </td>
        <td className="p-3 tabular-nums">{result.totalPoints ?? "—"}</td>
        <td className="p-3 tabular-nums">
          {result.averagePercent != null
            ? `${Number(result.averagePercent).toFixed(1)}%`
            : "—"}
        </td>
        <td className="p-3">
          {result.isPromoted === null ? "—" : result.isPromoted ? "Yes" : "No"}
        </td>
        <td className="p-3">
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              approved
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-theme-raised text-theme-muted"
            }`}
          >
            {approved ? "Approved" : "Draft"}
          </span>
        </td>
        <td className="p-3 text-right space-x-2 whitespace-nowrap">
          <button type="button" className="text-theme-muted" onClick={onToggle} aria-label="Expand">
            <ChevronDown className={`inline h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            className="text-theme-accent"
            onClick={onDownload}
            aria-label="Download report"
          >
            <Download className="inline h-4 w-4" />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-theme bg-theme-raised/30">
          <td colSpan={8} className="p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {result.subjectResults?.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between gap-3 rounded-lg bg-theme-surface px-3 py-2"
                >
                  <span>
                    {s.subjectName}{" "}
                    <span className="text-xs text-theme-muted">{s.subjectCode}</span>
                    {s.countsInResult ? null : (
                      <span className="ml-2 text-xs text-theme-muted">(not counted)</span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    CA{" "}
                    {s.assessmentPercent != null
                      ? Number(s.assessmentPercent).toFixed(1)
                      : "—"}
                    % · Exam{" "}
                    {s.examPercent != null ? Number(s.examPercent).toFixed(1) : "—"}% ·{" "}
                    {s.weightedScore != null
                      ? `${Number(s.weightedScore).toFixed(1)}%`
                      : "—"}{" "}
                    · {s.grade ?? "—"}
                    {s.gradeLabel ? ` (${s.gradeLabel})` : ""} · {s.points ?? "—"}
                  </span>
                </div>
              ))}
            </div>
            {(result.classTeacherComment || result.headTeacherComment) && (
              <div className="mt-3 space-y-1 text-sm text-theme-muted">
                {result.classTeacherComment ? (
                  <p>
                    <span className="font-medium text-theme-primary">Class teacher:</span>{" "}
                    {result.classTeacherComment}
                  </p>
                ) : null}
                {result.headTeacherComment ? (
                  <p>
                    <span className="font-medium text-theme-primary">Head teacher:</span>{" "}
                    {result.headTeacherComment}
                  </p>
                ) : null}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
