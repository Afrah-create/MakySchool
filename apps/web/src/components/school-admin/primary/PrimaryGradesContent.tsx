"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { schoolOffersPrimary, type PrimaryExam } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function PrimaryGradesContent({ portal = "admin" }: { portal?: "admin" | "teacher" }) {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const isTeacher = portal === "teacher";
  const { toast } = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);

  const [classId, setClassId] = useState(search.get("classId") || "");
  const [examId, setExamId] = useState(search.get("examId") || "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unlockId, setUnlockId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: exams = [] } = useQuery({
    queryKey: ["primary", "exams", classId, term?.id, portal],
    queryFn: () =>
      primaryApi.listExams({
        classId: classId || undefined,
        termId: term?.id,
      }),
    enabled: offers && !!classId,
  });

  useEffect(() => {
    if (examId) return;
    const open = exams.find((e) => e.status === "open") ?? exams[0];
    if (open) setExamId(open.id);
  }, [exams, examId]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (classId) q.set("classId", classId);
    if (examId) q.set("examId", examId);
    router.replace(`${pathname}?${q.toString()}`);
  }, [classId, examId, pathname, router]);

  const { data: grid, isPending } = useQuery({
    queryKey: ["primary", "exam-grades", examId],
    queryFn: () => primaryApi.examGrades(examId),
    enabled: offers && !!examId,
  });

  useEffect(() => {
    if (!grid) return;
    const next: Record<string, string> = {};
    for (const st of grid.students) {
      for (const subj of grid.subjects) {
        const cell = st.scores[subj.id];
        next[`${st.studentId}:${subj.id}`] =
          cell?.score != null ? String(cell.score) : "";
      }
    }
    setDrafts(next);
  }, [grid]);

  const selectedExam: PrimaryExam | undefined = useMemo(
    () => exams.find((e) => e.id === examId) ?? grid?.exam,
    [exams, examId, grid],
  );

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary grades">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function save(): Promise<boolean> {
    if (!grid || !examId) return false;
    const marks: Array<{
      studentId: string;
      subjectId: string;
      score: number | null;
      maxScore: number;
    }> = [];
    for (const st of grid.students) {
      for (const subj of grid.subjects) {
        const key = `${st.studentId}:${subj.id}`;
        const raw = (drafts[key] ?? "").toString().trim();
        const prev = st.scores[subj.id]?.score ?? null;
        if (raw === "") {
          // Allow clearing a previously saved score.
          if (prev != null) {
            marks.push({
              studentId: st.studentId,
              subjectId: subj.id,
              score: null,
              maxScore: subj.maxMark,
            });
          }
          continue;
        }
        const next = Number(raw);
        if (Number.isNaN(next)) {
          toast.error(`Invalid score for ${st.fullName} · ${subj.code}`);
          return;
        }
        // Always re-send filled scores so save is reliable even if drafts/grid drift.
        marks.push({
          studentId: st.studentId,
          subjectId: subj.id,
          score: next,
          maxScore: subj.maxMark,
        });
      }
    }
    if (!marks.length) {
      toast.error("Enter at least one score before saving.");
      return false;
    }
    setSaving(true);
    try {
      const result = (await primaryApi.bulkExamGrades(examId, marks)) as {
        saved?: number;
        recalcWarning?: string;
      };
      if (result?.recalcWarning) {
        toast.error(result.recalcWarning);
      } else {
        toast.success(`Saved ${result?.saved ?? marks.length} mark(s).`);
      }
      await qc.invalidateQueries({ queryKey: ["primary", "exam-grades", examId] });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!examId) return;
    setSubmitting(true);
    try {
      // Persist current grid first — submit only locks existing DB scores.
      const ok = await save();
      if (!ok) {
        setSubmitOpen(false);
        return;
      }
      await primaryApi.submitExam(examId);
      toast.success("Marks submitted.");
      setSubmitOpen(false);
      await qc.invalidateQueries({ queryKey: ["primary", "exam-grades", examId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function unlock(teacherId: string) {
    if (!examId) return;
    setUnlockId(teacherId);
    try {
      await primaryApi.unlockExamSubmission(examId, teacherId);
      toast.success("Teacher unlocked to re-enter marks.");
      await qc.invalidateQueries({ queryKey: ["primary", "exam-grades", examId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setUnlockId(null);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title={isTeacher ? "Enter marks" : "View grades"}
      description={
        isTeacher
          ? "Enter scores for subjects you teach on this exam. Submit when finished — an admin can unlock if you need changes. CA is entered separately and does not block submit."
          : "Teachers enter marks for exam subjects only. Unlock a teacher to let them re-enter after submission."
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-theme-muted">Class</span>
            <select className="ms-input" value={classId} onChange={(e) => {
              setClassId(e.target.value);
              setExamId("");
            }}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-theme-muted">Exam</span>
            <select className="ms-input min-w-[220px]" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        {!examId ? (
          <EmptyState
            title="No exam selected"
            description="Ask an admin to create and open an exam for this class."
          />
        ) : isPending || !grid ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-theme-muted">
              <p>
                {selectedExam?.name} ·{" "}
                <span className="capitalize">{selectedExam?.status}</span>
                {grid.submitted ? " · Submitted" : ""}
              </p>
              {isTeacher && grid.canEdit ? (
                <div className="flex gap-2">
                  <LoadingButton loading={saving} onClick={() => void save()}>
                    Save
                  </LoadingButton>
                  <LoadingButton
                    className="ms-btn-secondary"
                    loading={false}
                    onClick={() => setSubmitOpen(true)}
                  >
                    Submit
                  </LoadingButton>
                </div>
              ) : null}
            </div>

            {!isTeacher && grid.submissions.length > 0 ? (
              <div className="rounded-xl border border-theme p-3">
                <p className="text-xs font-semibold uppercase text-theme-muted">Submissions</p>
                <ul className="mt-2 space-y-2">
                  {grid.submissions.map((s) => (
                    <li key={s.teacherId} className="flex items-center justify-between text-sm">
                      <span>
                        {s.teacherName} · {new Date(s.submittedAt).toLocaleString()}
                      </span>
                      <LoadingButton
                        loading={unlockId === s.teacherId}
                        className="text-xs"
                        onClick={() => void unlock(s.teacherId)}
                      >
                        Unlock
                      </LoadingButton>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-theme">
              <table className="min-w-full text-sm">
                <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                  <tr>
                    <th className="sticky left-0 bg-theme-raised/50 px-3 py-2 text-left">Student</th>
                    {grid.subjects.map((s) => (
                      <th key={s.id} className="px-2 py-2 text-center">
                        {s.code}
                        {s.isPleSubject ? (
                          <span className="mt-0.5 block text-[10px] font-normal normal-case text-theme-muted">
                            agg
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {grid.students.map((st) => (
                    <tr key={st.studentId}>
                      <td className="sticky left-0 bg-theme-surface px-3 py-2 font-medium">
                        {st.fullName}
                      </td>
                      {grid.subjects.map((subj) => {
                        const key = `${st.studentId}:${subj.id}`;
                        const cell = st.scores[subj.id];
                        if (isTeacher && grid.canEdit) {
                          return (
                            <td key={subj.id} className="px-2 py-1">
                              <input
                                className="ms-input w-16 text-center tabular-nums"
                                value={drafts[key] ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={subj.id} className="px-2 py-2 text-center tabular-nums">
                            {cell?.score ?? "—"}
                            {cell?.grade ? (
                              <span className="ml-1 text-xs text-theme-muted">{cell.grade}</span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={submitOpen}
        title="Submit marks?"
        description="You will not be able to edit until an admin unlocks your submission."
        confirmLabel="Submit"
        loading={submitting}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void submit()}
      />
    </DashboardPage>
  );
}
