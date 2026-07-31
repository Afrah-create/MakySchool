"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import {
  isLowerPrimaryLevel,
  schoolOffersPrimary,
  type PrimaryExamType,
} from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  usePrimaryClasses,
  usePrimaryRoster,
  usePrimarySubjects,
  usePrimarySetup,
} from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { primaryKeys } from "@/hooks/usePrimary";

type ScoreRow = { studentId: string; fullName: string; learnerId: string | null; score: string };

export function PrimaryMarksContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const pathname = usePathname();
  const thematicBase = pathname.startsWith("/teacher/")
    ? "/teacher/primary/marks/thematic"
    : "/dashboard/primary/marks/thematic";
  const { data: term } = useCurrentTerm();
  const { data: setup } = usePrimarySetup(offers);
  const { data: classes = [] } = usePrimaryClasses(offers);

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [mode, setMode] = useState<"exam" | "ca" | "thematic">("exam");
  const [examType, setExamType] = useState<PrimaryExamType>("end_of_term");
  const [caTitle, setCaTitle] = useState("Test 1");
  const [caMax, setCaMax] = useState("20");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedClass = classes.find((c) => c.id === classId);
  const lower = selectedClass ? isLowerPrimaryLevel(selectedClass.level) : false;

  const { data: subjects = [] } = usePrimarySubjects(
    selectedClass?.level,
    offers && !!selectedClass && !lower,
  );
  const { data: roster = [], isPending: rosterLoading } = usePrimaryRoster(
    classId,
    offers && !!classId,
  );

  const examsKey = `${classId}|${subjectId}|${term?.id}|${examType}`;
  const { data: existingExams } = useQuery({
    queryKey: primaryKeys.exams(examsKey),
    queryFn: () =>
      primaryApi.listExams({
        classId,
        subjectId,
        termId: term!.id!,
        examType,
      }) as Promise<
        Array<{
          studentId: string;
          score: number | null;
          submitted: boolean;
          caPercentage: number | null;
          finalPercent: number | null;
          grade: string | null;
        }>
      >,
    enabled: offers && !!classId && !!subjectId && !!term?.id && mode === "exam" && !lower,
  });

  useEffect(() => {
    if (!classes.length) return;
    if (!classId) setClassId(classes[0].id);
  }, [classes, classId]);

  useEffect(() => {
    if (lower) setMode("thematic");
    else if (mode === "thematic") setMode("exam");
  }, [lower, mode]);

  useEffect(() => {
    const byId = new Map(
      (existingExams ?? []).map((e) => [e.studentId, e] as const),
    );
    setRows(
      roster.map((s) => ({
        studentId: s.id,
        fullName: s.fullName,
        learnerId: s.learnerId,
        score:
          byId.get(s.id)?.score != null ? String(byId.get(s.id)!.score) : "",
      })),
    );
  }, [roster, existingExams]);

  const locked = useMemo(
    () => (existingExams ?? []).some((e) => e.submitted),
    [existingExams],
  );

  const examLookup = useMemo(() => {
    const m = new Map<string, (typeof existingExams extends (infer U)[] | undefined ? U : never)>();
    for (const e of existingExams ?? []) m.set(e.studentId, e);
    return m;
  }, [existingExams]);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary marks">
        <EmptyState
          title="Primary not enabled"
          description="Secondary-only schools cannot enter primary marks."
        />
      </DashboardPage>
    );
  }

  if (!setup) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary marks">
        <EmptyState
          title="Setup required"
          description="Configure the primary module before entering marks."
          action={
            <a
              href={pathname.startsWith("/teacher/") ? "/teacher/dashboard" : "/dashboard/primary"}
              className="ms-btn-primary"
            >
              {pathname.startsWith("/teacher/") ? "Back to dashboard" : "Go to overview"}
            </a>
          }
        />
      </DashboardPage>
    );
  }

  async function saveExamDraft() {
    if (!classId || !subjectId || !term?.id) {
      toast.error("Select class, subject, and ensure a current term is set.");
      return;
    }
    setSaving(true);
    try {
      await primaryApi.bulkExams({
        classId,
        subjectId,
        examType,
        maxScore: 100,
        termId: term.id,
        marks: rows.map((r) => ({
          studentId: r.studentId,
          score: r.score === "" ? null : Number(r.score),
        })),
      });
      toast.success(`Saved exam marks for ${selectedClass?.name ?? "class"}.`);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCa() {
    if (!classId || !subjectId || !term?.id) return;
    const maxScore = Number(caMax);
    if (!caTitle.trim() || !(maxScore > 0)) {
      toast.error("Enter a CA title and max score.");
      return;
    }
    setSaving(true);
    try {
      await primaryApi.bulkCa({
        classId,
        subjectId,
        caTitle: caTitle.trim(),
        caType: "test",
        maxScore,
        termId: term.id,
        marks: rows.map((r) => ({
          studentId: r.studentId,
          score: r.score === "" ? null : Number(r.score),
        })),
      });
      toast.success(`Saved CA “${caTitle.trim()}” for ${rows.length} students.`);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmSubmit() {
    if (!classId || !subjectId || !term?.id) return;
    setSubmitting(true);
    try {
      const result = await primaryApi.submitExams({
        classId,
        subjectId,
        termId: term.id,
        examType,
      });
      if (result.missingCount > 0) {
        toast.info(
          `Submitted with ${result.missingCount} missing score(s). Those students have no grade yet.`,
        );
      } else {
        toast.success("Exam marks submitted and locked.");
      }
      setSubmitOpen(false);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Marks entry"
      description="Bulk entry for whole classes — designed for large schools."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block sm:min-w-[10rem] sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Class
            </span>
            <select
              className="ms-input w-full"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId("");
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!lower ? (
            <label className="block sm:min-w-[10rem] sm:flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Subject
              </span>
              <select
                className="ms-input w-full"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex gap-2">
            {!lower ? (
              <>
                <button
                  type="button"
                  className={mode === "exam" ? "ms-btn-primary text-xs" : "ms-btn-secondary text-xs"}
                  onClick={() => setMode("exam")}
                >
                  Exams
                </button>
                <button
                  type="button"
                  className={mode === "ca" ? "ms-btn-primary text-xs" : "ms-btn-secondary text-xs"}
                  onClick={() => setMode("ca")}
                >
                  CA
                </button>
              </>
            ) : (
              <a href={thematicBase} className="ms-btn-primary text-xs">
                Open thematic grid
              </a>
            )}
          </div>
        </div>

        {lower ? (
          <EmptyState
            title="Lower primary class"
            description="P1–P3 use thematic levels. Open the thematic assessment grid."
            action={
              <a
                href={`${thematicBase}?classId=${classId}`}
                className="ms-btn-primary"
              >
                Thematic assessment
              </a>
            }
          />
        ) : rosterLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !subjectId ? (
          <EmptyState title="Select a subject" description="Choose a subject to enter marks." />
        ) : (
          <>
            {mode === "ca" ? (
              <div className="flex flex-wrap gap-3 rounded-xl border border-theme bg-theme-surface p-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">CA title</span>
                  <input
                    className="ms-input"
                    value={caTitle}
                    onChange={(e) => setCaTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">Max score</span>
                  <input
                    className="ms-input w-24"
                    value={caMax}
                    onChange={(e) => setCaMax(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">Exam type</span>
                  <select
                    className="ms-input"
                    value={examType}
                    onChange={(e) => setExamType(e.target.value as PrimaryExamType)}
                    disabled={locked}
                  >
                    <option value="end_of_term">End of term</option>
                    <option value="mid_term">Mid-term</option>
                    <option value="mock">Mock</option>
                    <option value="ple_mock">PLE mock</option>
                  </select>
                </label>
                {locked ? (
                  <span className="rounded-full bg-theme-raised px-3 py-1 text-xs font-medium text-theme-muted">
                    Submitted · locked
                  </span>
                ) : null}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-theme">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-theme-raised/50 text-[11px] uppercase tracking-wider text-theme-muted">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Learner ID</th>
                    <th className="px-3 py-2">Score</th>
                    {mode === "exam" ? (
                      <>
                        <th className="px-3 py-2">CA%</th>
                        <th className="px-3 py-2">Final%</th>
                        <th className="px-3 py-2">Grade</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {rows.map((row) => {
                    const ex = examLookup.get(row.studentId);
                    return (
                      <tr key={row.studentId} className="bg-theme-surface">
                        <td className="px-3 py-2 font-medium text-theme-primary">
                          {row.fullName}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-theme-muted">
                          {row.learnerId ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="ms-input w-24"
                            inputMode="decimal"
                            disabled={locked && mode === "exam"}
                            value={row.score}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.studentId === row.studentId
                                    ? { ...r, score: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </td>
                        {mode === "exam" ? (
                          <>
                            <td className="px-3 py-2 tabular-nums text-theme-muted">
                              {ex?.caPercentage ?? "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-theme-muted">
                              {ex?.finalPercent ?? "—"}
                            </td>
                            <td className="px-3 py-2">{ex?.grade ?? "—"}</td>
                          </>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <LoadingButton
                loading={saving}
                disabled={locked && mode === "exam"}
                onClick={() => void (mode === "ca" ? saveCa() : saveExamDraft())}
              >
                Save {mode === "ca" ? "CA" : "draft"} ({rows.length})
              </LoadingButton>
              {mode === "exam" && !locked ? (
                <button
                  type="button"
                  className="ms-btn-secondary"
                  onClick={() => setSubmitOpen(true)}
                >
                  Submit & lock
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={submitOpen}
        title="Submit exam marks?"
        description="Submitted marks are locked for teachers. An admin can unlock later if needed."
        confirmLabel="Submit"
        loading={submitting}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void confirmSubmit()}
      />
    </DashboardPage>
  );
}
