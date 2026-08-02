"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import {
  OLevelTeacherGradeGrid,
  cellKey,
} from "@/components/olevel/OLevelTeacherGradeGrid";
import {
  useOLevelCurriculum,
  useOLevelSessionMarkGrid,
  useSaveOLevelSessionMarks,
  useSubmitOLevelMarks,
  useTeacherOLevelAssignments,
} from "@/hooks/useOLevel";
import { useToast } from "@/providers/ToastProvider";

export function TeacherOLevelMarksContent() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: assignments = [] } = useTeacherOLevelAssignments();
  const [sessionId, setSessionId] = useState(params.get("session") ?? "");
  const assignment = assignments.find((a) => a.examSessionId === sessionId);
  const { data: grid, refetch, isPending: gridPending } = useOLevelSessionMarkGrid(
    sessionId || undefined,
  );
  const { data: curriculum } = useOLevelCurriculum();
  const [values, setValues] = useState<Record<string, string>>({});
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const save = useSaveOLevelSessionMarks();
  const submit = useSubmitOLevelMarks();

  useEffect(() => {
    if (!grid) return;
    const nextValues: Record<string, string> = {};
    const nextAbsent: Record<string, boolean> = {};
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!student.registeredSubjectIds.includes(subject.id)) continue;
        const key = cellKey(student.studentId, subject.id);
        const cell = grid.marks[key];
        nextAbsent[key] = Boolean(cell?.isAbsent);
        nextValues[key] =
          cell?.rawScore === null || cell?.rawScore === undefined
            ? ""
            : String(cell.rawScore);
      }
    }
    setValues(nextValues);
    setAbsent(nextAbsent);
    setDirty(false);
  }, [grid]);

  const filteredStudents = useMemo(() => {
    if (!grid) return [];
    const q = query.trim().toLowerCase();
    if (!q) return grid.students;
    return grid.students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        (s.learnerId ?? "").toLowerCase().includes(q),
    );
  }, [grid, query]);

  const filteredGrid = useMemo(() => {
    if (!grid) return null;
    return { ...grid, students: filteredStudents };
  }, [grid, filteredStudents]);

  const maxMarks = grid?.maxMarks ?? 100;
  const locked = grid?.submissionStatus === "submitted";
  const canEdit = Boolean(grid?.canEdit);

  const { enteredCount, expectedCount, missingCount } = useMemo(() => {
    if (!grid) return { enteredCount: 0, expectedCount: 0, missingCount: 0 };
    let expected = 0;
    let entered = 0;
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!student.registeredSubjectIds.includes(subject.id)) continue;
        expected += 1;
        const key = cellKey(student.studentId, subject.id);
        if (absent[key] || (values[key] ?? "").trim() !== "") entered += 1;
      }
    }
    return {
      enteredCount: entered,
      expectedCount: expected,
      missingCount: expected - entered,
    };
  }, [grid, values, absent]);

  function gradeFor(score: number | null): string {
    if (score === null || !grid) return "—";
    const percent = (score / maxMarks) * 100;
    const scale = grid.gradeScale ?? curriculum?.gradeScale ?? [];
    return (
      scale.find((g) => percent >= g.minPercent && percent <= g.maxPercent)?.grade ??
      "—"
    );
  }

  function show(tone: "success" | "error" | "info", message: string) {
    setBanner({ tone, message });
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message);
    else toast.info(message);
  }

  function buildEntries() {
    if (!grid) return [];
    const entries: Array<{
      studentId: string;
      subjectId: string;
      rawScore: number | null;
      isAbsent: boolean;
      remarks: string | null;
    }> = [];
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!student.registeredSubjectIds.includes(subject.id)) continue;
        if (!grid.editableSubjectIds.includes(subject.id)) continue;
        const key = cellKey(student.studentId, subject.id);
        const isAbs = Boolean(absent[key]);
        const raw = (values[key] ?? "").trim();
        entries.push({
          studentId: student.studentId,
          subjectId: subject.id,
          rawScore: isAbs || raw === "" ? null : Number(raw),
          isAbsent: isAbs,
          remarks: grid.marks[key]?.remarks ?? null,
        });
      }
    }
    return entries;
  }

  async function persist(options?: { silent?: boolean }) {
    if (!sessionId || !grid) return false;
    try {
      await save.mutateAsync({
        examSessionId: sessionId,
        entries: buildEntries(),
      });
      setDirty(false);
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
    if (!expectedCount) {
      show("error", "No registered students on this sheet to submit.");
      return;
    }
    if (missingCount > 0) {
      show(
        "error",
        `${missingCount} cell${missingCount === 1 ? "" : "s"} still need a score or absence before you can submit.`,
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
      await submit.mutateAsync({ examSessionId: sessionId });
      setConfirmSubmit(false);
      show("success", "Marks submitted and locked for all your subjects.");
      void refetch();
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Could not submit marks.");
    } finally {
      setSubmitting(false);
    }
  }

  const subjectNames =
    assignment?.subjects.map((s) => s.name).join(", ") ||
    grid?.subjects.map((s) => s.name).join(", ") ||
    "your subjects";

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Enter marks"
      description="One sheet for all subjects you teach in this class. Save a draft, then submit to lock."
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
            All sessions
          </Link>
          <select
            className="ms-input w-full sm:max-w-xl"
            value={sessionId || ""}
            onChange={(e) => {
              setSessionId(e.target.value);
              setQuery("");
              setBanner(null);
            }}
          >
            <option value="">Choose session</option>
            {assignments.map((a) => (
              <option key={a.examSessionId} value={a.examSessionId}>
                {a.title} · {a.className} · {a.subjects.length} subject
                {a.subjects.length === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>

        {sessionId && filteredGrid ? (
          <>
            <div className="rounded-xl border border-theme bg-theme-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-theme-primary">
                    {filteredGrid.examSession.title}
                  </h2>
                  <p className="mt-1 text-sm text-theme-muted">
                    {assignment
                      ? `${assignment.className} · ${assignment.termName}`
                      : filteredGrid.examSession.className}
                    {" · "}
                    {subjectNames}
                  </p>
                </div>
                <StatusPill status={filteredGrid.submissionStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-theme-muted">
                <span>
                  Max marks: <strong className="text-theme-primary">{maxMarks}</strong>
                </span>
                <span>
                  Entered:{" "}
                  <strong className="text-theme-primary">
                    {enteredCount}/{expectedCount}
                  </strong>
                </span>
                <span>
                  Subjects:{" "}
                  <strong className="text-theme-primary">
                    {filteredGrid.subjects.length}
                  </strong>
                </span>
              </div>
              {filteredGrid.submissionStatus === "unlocked" &&
              filteredGrid.unlockReason ? (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Unlocked for correction: {filteredGrid.unlockReason}
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

            <OLevelTeacherGradeGrid
              grid={filteredGrid}
              values={values}
              absent={absent}
              canEdit={canEdit}
              gradeFor={gradeFor}
              onChange={(key, value) => {
                setValues((prev) => ({ ...prev, [key]: value }));
                setDirty(true);
              }}
              onAbsentChange={(key, isAbsent) => {
                setAbsent((prev) => ({ ...prev, [key]: isAbsent }));
                if (isAbsent) {
                  setValues((prev) => ({ ...prev, [key]: "" }));
                }
                setDirty(true);
              }}
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
        ) : sessionId && gridPending ? (
          <p className="text-sm text-theme-muted">Loading mark sheet…</p>
        ) : (
          <p className="rounded-xl border border-theme bg-theme-surface p-6 text-center text-sm text-theme-muted">
            Choose a session to enter marks for all subjects you teach in that class.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit and lock marks?"
        description={`You are about to submit ${enteredCount} of ${expectedCount} marks across ${grid?.subjects.length ?? 0} subject(s) for ${assignment?.className ?? "this class"}. After submission the sheet is locked until an administrator unlocks it.`}
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
    <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${tone}`}>
      {status}
    </span>
  );
}
