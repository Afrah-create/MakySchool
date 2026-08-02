"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { PAGE_SIZE_OPTIONS } from "@makyschool/shared/constants";
import type { OLevelMarkEntry } from "@makyschool/shared";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  useOLevelCurriculum,
  useOLevelMarkGrid,
  useSaveOLevelMarks,
  useSubmitOLevelMarks,
  useTeacherOLevelAssignments,
} from "@/hooks/useOLevel";
import { useToast } from "@/providers/ToastProvider";

type DraftMark = {
  studentId: string;
  studentName: string;
  learnerId: string;
  rawScore: string;
  isAbsent: boolean;
  remarks: string;
};

function toDraft(marks: OLevelMarkEntry[]): DraftMark[] {
  return marks.map((m) => ({
    studentId: m.studentId,
    studentName: m.studentName?.trim() || "Unknown student",
    learnerId: m.learnerId?.trim() || "",
    rawScore: m.rawScore === null || m.rawScore === undefined ? "" : String(m.rawScore),
    isAbsent: Boolean(m.isAbsent),
    remarks: m.remarks ?? "",
  }));
}

export function TeacherOLevelMarksContent() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: assignments = [] } = useTeacherOLevelAssignments();
  const [sessionId, setSessionId] = useState(params.get("session") ?? "");
  const [subjectId, setSubjectId] = useState(params.get("subject") ?? "");
  const assignment = assignments.find(
    (a) => a.examSessionId === sessionId && a.subjectId === subjectId,
  );
  const { data: grid, refetch, isPending: gridPending } = useOLevelMarkGrid(
    sessionId || undefined,
    subjectId || undefined,
  );
  const { data: curriculum } = useOLevelCurriculum();
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const save = useSaveOLevelMarks();
  const submit = useSubmitOLevelMarks();

  useEffect(() => {
    setMarks(toDraft(grid?.marks ?? []));
  }, [grid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return marks;
    return marks.filter(
      (m) =>
        m.studentName.toLowerCase().includes(q) ||
        m.learnerId.toLowerCase().includes(q),
    );
  }, [marks, query]);

  const { paged, page, setPage, pageSize, setPageSize, total } = useClientPagination({
    items: filtered,
    resetDeps: [sessionId, subjectId, query],
  });

  const maxMarks = grid?.examSession.maxMarks ?? 100;
  const locked = grid?.submissionStatus === "submitted";
  const enteredCount = marks.filter(
    (m) => m.isAbsent || (m.rawScore !== "" && Number.isFinite(Number(m.rawScore))),
  ).length;
  const missingCount = marks.length - enteredCount;

  function gradeFor(score: number | null): string {
    if (score === null || !grid) return "—";
    const percent = (score / maxMarks) * 100;
    const scale = grid.gradeScale ?? curriculum?.gradeScale ?? [];
    return scale.find((g) => percent >= g.minPercent && percent <= g.maxPercent)?.grade ?? "—";
  }

  function updateByStudent(studentId: string, patch: Partial<DraftMark>) {
    setMarks((prev) =>
      prev.map((m) => (m.studentId === studentId ? { ...m, ...patch } : m)),
    );
  }

  function show(tone: "success" | "error" | "info", message: string) {
    setBanner({ tone, message });
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message);
    else toast.info(message);
  }

  async function persist(options?: { silent?: boolean }) {
    if (!sessionId || !subjectId) return false;
    try {
      await save.mutateAsync({
        examSessionId: sessionId,
        subjectId,
        marks: marks.map((m) => ({
          studentId: m.studentId,
          rawScore: m.rawScore === "" ? null : Number(m.rawScore),
          isAbsent: m.isAbsent,
          remarks: m.remarks || null,
        })),
      });
      if (!options?.silent) show("success", "Draft saved.");
      void refetch();
      return true;
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Could not save marks.");
      return false;
    }
  }

  function requestSubmit() {
    setBanner(null);
    if (!marks.length) {
      show("error", "No students on this sheet to submit.");
      return;
    }
    if (missingCount > 0) {
      show(
        "error",
        `${missingCount} student${missingCount === 1 ? "" : "s"} still need a score or absence before you can submit.`,
      );
      return;
    }
    setConfirmSubmit(true);
  }

  async function confirmAndLock() {
    setSubmitting(true);
    setBanner(null);
    try {
      const saved = await persist({ silent: true });
      if (!saved) return;
      await submit.mutateAsync({ examSessionId: sessionId, subjectId });
      setConfirmSubmit(false);
      show("success", "Marks submitted and locked.");
      void refetch();
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Could not submit marks.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Enter marks"
      description="Save a draft as you go, then submit to lock the sheet."
    >
      <div className="space-y-4">
        {banner ? (
          <StatusBanner
            tone={banner.tone}
            message={banner.message}
            onDismiss={() => setBanner(null)}
            autoDismissMs={banner.tone === "success" ? 4000 : undefined}
          />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/teacher/olevel"
            className="inline-flex items-center gap-1.5 text-sm text-theme-muted hover:text-theme-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            All assignments
          </Link>
          <select
            className="ms-input w-full sm:max-w-xl"
            value={sessionId && subjectId ? `${sessionId}:${subjectId}` : ":"}
            onChange={(e) => {
              const [s = "", sub = ""] = e.target.value.split(":");
              setSessionId(s);
              setSubjectId(sub);
              setQuery("");
              setBanner(null);
            }}
          >
            <option value=":">Choose assignment</option>
            {assignments.map((a) => (
              <option
                key={`${a.examSessionId}:${a.subjectId}`}
                value={`${a.examSessionId}:${a.subjectId}`}
              >
                {a.subjectName} · {a.className} · {a.title}
              </option>
            ))}
          </select>
        </div>

        {sessionId && subjectId && grid ? (
          <>
            <div className="rounded-xl border border-theme bg-theme-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-theme-primary">
                    {assignment?.subjectName ?? "Subject"}
                    {assignment?.subjectCode ? (
                      <span className="ml-2 text-sm font-normal text-theme-muted">
                        ({assignment.subjectCode})
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-1 text-sm text-theme-muted">
                    {grid.examSession.title}
                    {assignment ? ` · ${assignment.className} · ${assignment.termName}` : null}
                  </p>
                </div>
                <StatusPill status={grid.submissionStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-theme-muted">
                <span>
                  Max marks: <strong className="text-theme-primary">{maxMarks}</strong>
                </span>
                <span>
                  Entered:{" "}
                  <strong className="text-theme-primary">
                    {enteredCount}/{marks.length}
                  </strong>
                </span>
              </div>
              {grid.submissionStatus === "unlocked" && grid.unlockReason ? (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Unlocked for correction: {grid.unlockReason}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                className="ms-input w-full sm:max-w-xs"
                placeholder="Search name or student ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!locked ? (
                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    loading={save.isPending && !submitting}
                    loadingLabel="Saving…"
                    onClick={() => void persist()}
                  >
                    Save draft
                  </LoadingButton>
                  <LoadingButton
                    loading={submitting}
                    loadingLabel="Submitting…"
                    onClick={requestSubmit}
                  >
                    Submit and lock
                  </LoadingButton>
                </div>
              ) : (
                <p className="text-sm text-theme-muted">This sheet is locked.</p>
              )}
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {paged.map((m) => {
                const scoreNum = m.rawScore === "" || m.isAbsent ? null : Number(m.rawScore);
                const pct =
                  scoreNum === null ? "—" : `${((scoreNum / maxMarks) * 100).toFixed(1)}%`;
                return (
                  <article
                    key={m.studentId}
                    className="rounded-xl border border-theme bg-theme-surface p-4 space-y-3"
                  >
                    <div>
                      <p className="font-medium text-theme-primary">{m.studentName}</p>
                      <p className="text-xs text-theme-muted">
                        {m.learnerId ? `ID ${m.learnerId}` : "No student ID"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs text-theme-muted col-span-1">
                        Score / {maxMarks}
                        <input
                          className="ms-input mt-1 w-full"
                          type="number"
                          min={0}
                          max={maxMarks}
                          inputMode="decimal"
                          disabled={locked || m.isAbsent}
                          value={m.rawScore}
                          onChange={(e) =>
                            updateByStudent(m.studentId, { rawScore: e.target.value })
                          }
                        />
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm text-theme-primary">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={m.isAbsent}
                          disabled={locked}
                          onChange={(e) =>
                            updateByStudent(m.studentId, {
                              isAbsent: e.target.checked,
                              rawScore: e.target.checked ? "" : m.rawScore,
                            })
                          }
                        />
                        Absent
                      </label>
                    </div>
                    <label className="block text-xs text-theme-muted">
                      Remarks
                      <input
                        className="ms-input mt-1 w-full"
                        disabled={locked}
                        value={m.remarks}
                        onChange={(e) =>
                          updateByStudent(m.studentId, { remarks: e.target.value })
                        }
                      />
                    </label>
                    <p className="text-sm text-theme-muted">
                      Live: {pct} · Grade {gradeFor(scoreNum)}
                    </p>
                  </article>
                );
              })}
              {!paged.length ? (
                <p className="rounded-xl border border-theme bg-theme-surface p-6 text-center text-sm text-theme-muted">
                  {gridPending
                    ? "Loading students…"
                    : query
                      ? "No students match your search."
                      : "No students registered for this subject yet."}
                </p>
              ) : null}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-theme bg-theme-surface md:block">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-theme-muted">
                  <tr>
                    <th className="p-3 text-left">#</th>
                    <th className="p-3 text-left">Student</th>
                    <th className="p-3 text-left">Student ID</th>
                    <th className="p-3 text-left">Score</th>
                    <th className="p-3 text-left">Absent</th>
                    <th className="p-3 text-left">Remarks</th>
                    <th className="p-3 text-left">% / Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((m, idx) => {
                    const scoreNum =
                      m.rawScore === "" || m.isAbsent ? null : Number(m.rawScore);
                    const pct =
                      scoreNum === null
                        ? "—"
                        : `${((scoreNum / maxMarks) * 100).toFixed(1)}%`;
                    return (
                      <tr key={m.studentId} className="border-t border-theme">
                        <td className="p-3 tabular-nums text-theme-muted">
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        <td className="p-3 font-medium text-theme-primary">{m.studentName}</td>
                        <td className="p-3 text-theme-muted">{m.learnerId || "—"}</td>
                        <td className="p-3">
                          <input
                            className="ms-input w-24"
                            type="number"
                            min={0}
                            max={maxMarks}
                            disabled={locked || m.isAbsent}
                            value={m.rawScore}
                            onChange={(e) =>
                              updateByStudent(m.studentId, { rawScore: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={m.isAbsent}
                            disabled={locked}
                            onChange={(e) =>
                              updateByStudent(m.studentId, {
                                isAbsent: e.target.checked,
                                rawScore: e.target.checked ? "" : m.rawScore,
                              })
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            className="ms-input min-w-40"
                            disabled={locked}
                            value={m.remarks}
                            onChange={(e) =>
                              updateByStudent(m.studentId, { remarks: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-3 tabular-nums text-theme-muted">
                          {pct} · {gradeFor(scoreNum)}
                        </td>
                      </tr>
                    );
                  })}
                  {!paged.length ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-theme-muted">
                        {query
                          ? "No students match your search."
                          : "No students registered for this subject yet."}
                      </td>
                    </tr>
                  ) : null}
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

            {!locked ? (
              <div className="sticky bottom-3 z-10 flex gap-2 rounded-xl border border-theme bg-theme-surface/95 p-3 shadow-theme-panel backdrop-blur md:hidden">
                <LoadingButton
                  className="flex-1"
                  loading={save.isPending && !submitting}
                  onClick={() => void persist()}
                >
                  Save draft
                </LoadingButton>
                <LoadingButton
                  className="flex-1"
                  loading={submitting}
                  onClick={requestSubmit}
                >
                  Submit
                </LoadingButton>
              </div>
            ) : null}
          </>
        ) : sessionId && subjectId && gridPending ? (
          <p className="text-sm text-theme-muted">Loading mark sheet…</p>
        ) : (
          <p className="rounded-xl border border-theme bg-theme-surface p-6 text-center text-sm text-theme-muted">
            Choose an assignment to enter marks.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit and lock marks?"
        description={`You are about to submit ${enteredCount} of ${marks.length} marks for ${assignment?.subjectName ?? "this subject"} (${assignment?.className ?? "class"}). After submission the sheet is locked until an administrator unlocks it.`}
        confirmLabel="Submit and lock"
        loading={submitting}
        onCancel={() => {
          if (!submitting) setConfirmSubmit(false);
        }}
        onConfirm={() => void confirmAndLock()}
      />
    </DashboardPage>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "submitted"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "unlocked"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
        : "bg-theme-raised text-theme-muted";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${tone}`}>{status}</span>
  );
}
