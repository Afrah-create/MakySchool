"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  schoolOffersOLevel,
  schoolOffersPrimary,
  type RolloverTrack,
} from "@makyschool/shared/constants";
import type {
  FeeStructurePreviewRow,
  PromotionPreviewResponse,
  RolloverDraft,
  RolloverExecuteResult,
  RolloverSession,
  StudentDecisionDraft,
  TeacherAssignmentPreviewRow,
} from "@makyschool/shared/types";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataTable } from "@makyschool/ui/components/ui/DataTable";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { useSchoolSettings } from "@/components/school-admin/settings/useSchoolSettings";
import {
  cancelRolloverSession,
  executeRolloverSession,
  fetchFeePreview,
  fetchPromotionPreview,
  fetchRolloverHistory,
  fetchTeacherPreview,
  fetchTimetablePreview,
  listRolloverSessions,
  patchRolloverSession,
  startRolloverSession,
} from "@/lib/api/rollover";
import { useToast } from "@/providers/ToastProvider";

const STEP_LABELS = [
  "New year",
  "Students",
  "Teachers",
  "Fees",
  "Timetable",
  "Confirm",
] as const;

function trackLabel(track: RolloverTrack) {
  return track === "primary" ? "Primary" : "Secondary";
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-UG").format(amount);
}

export function YearRolloverPage() {
  const { toast } = useToast();
  const { settings, loading: settingsLoading, error: settingsError, reload } = useSchoolSettings();
  const schoolType = settings?.profile.school_type ?? null;

  const availableTracks = useMemo(() => {
    const tracks: RolloverTrack[] = [];
    if (schoolOffersPrimary(schoolType)) tracks.push("primary");
    if (schoolOffersOLevel(schoolType)) tracks.push("secondary");
    return tracks;
  }, [schoolType]);

  const [sessions, setSessions] = useState<RolloverSession[]>([]);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      track: RolloverTrack;
      fromYear: number;
      toYear: number;
      performedAt: string | null;
      summary: string;
    }>
  >([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<RolloverSession | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<RolloverExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [promotion, setPromotion] = useState<PromotionPreviewResponse | null>(null);
  const [teachers, setTeachers] = useState<{
    assignments: TeacherAssignmentPreviewRow[];
    summary: { total: number; mappable: number; unmapped: number };
  } | null>(null);
  const [fees, setFees] = useState<{
    structures: FeeStructurePreviewRow[];
    summary: { total: number; lineItems: number };
  } | null>(null);
  const [timetable, setTimetable] = useState<{
    sourceTermId: string | null;
    terms: Array<{ id: string; name: string }>;
    summary: { total: number; mappable: number; unmapped: number };
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refreshBoot = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    try {
      const [active, hist] = await Promise.all([listRolloverSessions(), fetchRolloverHistory()]);
      setSessions(active);
      setHistory(hist);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Could not load rollover data.");
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void refreshBoot();
  }, [refreshBoot]);

  const draft = session?.draft ?? {};

  const persistDraft = async (nextStep: number, draftPatch: RolloverDraft) => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchRolloverSession(session.id, {
        currentStep: nextStep,
        draft: draftPatch as Record<string, unknown>,
      });
      setSession(updated);
      setStep(updated.currentStep);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save progress.";
      setError(message);
      toast.error(message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const loadStepPreviews = useCallback(
    async (active: RolloverSession, targetStep: number) => {
      setPreviewLoading(true);
      setError(null);
      try {
        const fromId = active.fromAcademicYearId;
        const track = active.track;
        if (targetStep === 2) {
          setPromotion(await fetchPromotionPreview(track, fromId));
        } else if (targetStep === 3) {
          setTeachers(await fetchTeacherPreview(track, fromId));
        } else if (targetStep === 4) {
          setFees(await fetchFeePreview(track, fromId));
        } else if (targetStep === 5) {
          const sourceTermId = active.draft.timetable?.sourceTermId ?? null;
          const data = await fetchTimetablePreview(track, fromId, sourceTermId);
          setTimetable({
            sourceTermId: data.sourceTermId,
            terms: data.terms,
            summary: data.summary,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load step data.";
        setError(message);
      } finally {
        setPreviewLoading(false);
      }
    },
    [],
  );

  const openSession = async (active: RolloverSession) => {
    setSession(active);
    setStep(active.currentStep || 1);
    setResult(null);
    await loadStepPreviews(active, active.currentStep || 1);
  };

  const beginTrack = async (track: RolloverTrack) => {
    setSaving(true);
    setError(null);
    try {
      const created = await startRolloverSession(track);
      await refreshBoot();
      await openSession(created);
      toast.success(`${trackLabel(track)} rollover started.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start rollover.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const effectiveAction = (studentId: string, proposed: string) => {
    const override = draft.studentDecisions?.[studentId]?.action;
    return override || proposed;
  };

  const setStudentAction = (studentId: string, action: StudentDecisionDraft["action"], targetClassId?: string | null) => {
    if (!session) return;
    const nextDecisions = {
      ...(draft.studentDecisions || {}),
      [studentId]: { action, targetClassId: targetClassId ?? null },
    };
    setSession({
      ...session,
      draft: { ...draft, studentDecisions: nextDecisions },
    });
  };

  const approveAllPromotions = () => {
    if (!session || !promotion) return;
    const next: Record<string, StudentDecisionDraft> = { ...(draft.studentDecisions || {}) };
    for (const row of promotion.students) {
      if (row.proposedAction === "promote" && row.proposedClassId) {
        next[row.studentId] = { action: "promote", targetClassId: row.proposedClassId };
      }
    }
    setSession({ ...session, draft: { ...draft, studentDecisions: next } });
  };

  const overrideSelectedRepeat = (studentIds: string[]) => {
    if (!session || !promotion) return;
    const next: Record<string, StudentDecisionDraft> = { ...(draft.studentDecisions || {}) };
    for (const id of studentIds) {
      const row = promotion.students.find((s) => s.studentId === id);
      if (!row) continue;
      next[id] = { action: "repeat", targetClassId: row.currentClassId };
    }
    setSession({ ...session, draft: { ...draft, studentDecisions: next } });
  };

  const goNext = async () => {
    if (!session) return;
    try {
      if (step === 1) {
        const year = draft.newYear?.year;
        if (!year || year < 1990) {
          setError("Enter a valid academic year number.");
          return;
        }
        const terms = draft.newYear?.terms || [];
        if (!terms.length) {
          setError("Add at least one term.");
          return;
        }
        await persistDraft(2, { newYear: draft.newYear });
        await loadStepPreviews(session, 2);
        return;
      }
      if (step === 2) {
        await persistDraft(3, { studentDecisions: draft.studentDecisions || {} });
        await loadStepPreviews(session, 3);
        return;
      }
      if (step === 3) {
        const ids =
          draft.teacherAssignmentIds ??
          teachers?.assignments.filter((a) => a.mappable).map((a) => a.assignmentId) ??
          [];
        await persistDraft(4, { teacherAssignmentIds: ids });
        await loadStepPreviews(session, 4);
        return;
      }
      if (step === 4) {
        const ids =
          draft.feeStructureIds ?? fees?.structures.map((s) => s.structureId) ?? [];
        await persistDraft(5, {
          feeStructureIds: ids,
          feePercentIncrease: draft.feePercentIncrease ?? 0,
        });
        await loadStepPreviews(session, 5);
        return;
      }
      if (step === 5) {
        await persistDraft(6, {
          timetable: draft.timetable ?? { include: true, sourceTermId: timetable?.sourceTermId ?? null },
        });
        return;
      }
      if (step === 6) {
        setConfirmOpen(true);
      }
    } catch {
      /* toast already shown */
    }
  };

  const goBack = async () => {
    if (!session || step <= 1) return;
    const next = step - 1;
    await persistDraft(next, {});
    await loadStepPreviews(session, next);
  };

  const runExecute = async () => {
    if (!session) return;
    setExecuting(true);
    setError(null);
    try {
      // Persist final draft first
      await patchRolloverSession(session.id, {
        currentStep: 6,
        draft: {
          newYear: draft.newYear,
          studentDecisions: draft.studentDecisions || {},
          teacherAssignmentIds:
            draft.teacherAssignmentIds ??
            teachers?.assignments.filter((a) => a.mappable).map((a) => a.assignmentId) ??
            [],
          feeStructureIds: draft.feeStructureIds ?? fees?.structures.map((s) => s.structureId) ?? [],
          feePercentIncrease: draft.feePercentIncrease ?? 0,
          timetable: draft.timetable ?? {
            include: true,
            sourceTermId: timetable?.sourceTermId ?? null,
          },
        },
      });
      const key = `rollover-${session.id}-${Date.now()}`;
      const executed = await executeRolloverSession(session.id, key);
      setResult(executed);
      setConfirmOpen(false);
      toast.success(executed.summary);
      setSession(null);
      await refreshBoot();
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rollover failed.";
      setError(message);
      toast.error(message);
    } finally {
      setExecuting(false);
    }
  };

  const cancelActive = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await cancelRolloverSession(session.id);
      toast.success("Rollover cancelled. No changes were applied.");
      setSession(null);
      setResult(null);
      await refreshBoot();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading || booting) {
    return (
      <DashboardPage
        embedded
        eyebrow="Settings"
        title="Year rollover"
        description="Carry configuration forward and promote students into the new academic year."
        maxWidth="7xl"
      >
        <SkeletonTable rows={6} />
      </DashboardPage>
    );
  }

  if (settingsError || bootError) {
    return (
      <DashboardPage embedded eyebrow="Settings" title="Year rollover" maxWidth="7xl">
        <EmptyState
          variant="error"
          title="Couldn't load rollover"
          description={settingsError || bootError || "Try again."}
          onRetry={() => {
            void reload();
            void refreshBoot();
          }}
        />
      </DashboardPage>
    );
  }

  if (result) {
    return (
      <DashboardPage
        embedded
        eyebrow="Settings"
        title="Rollover complete"
        description={result.summary}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <StatusBanner
            tone="success"
            message="New academic year started. Historical data from the previous year was preserved."
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-theme-text-muted">
            {(result.postRolloverChecklist || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ms-btn-primary rounded-xl px-4 py-2" onClick={() => setResult(null)}>
              Back to rollover
            </button>
            <Link href="/dashboard/settings/academic" className="ms-btn-ghost rounded-xl px-4 py-2">
              Academic settings
            </Link>
          </div>
        </div>
      </DashboardPage>
    );
  }

  if (!session) {
    return (
      <DashboardPage
        embedded
        eyebrow="Settings"
        title="Year rollover"
        description="Run primary and secondary rollovers separately. Only the school admin can execute a rollover. S5 after O-Level stays manual."
        maxWidth="7xl"
      >
        <div className="space-y-6">
          {sessions.length > 0 ? (
            <StatusBanner
              tone="info"
              message="Rollover in progress — resume an unfinished wizard below. Nothing is committed until the final confirm step."
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {availableTracks.map((track) => {
              const active = sessions.find((s) => s.track === track);
              return (
                <div
                  key={track}
                  className="rounded-xl border border-theme-border bg-theme-surface p-5 shadow-sm"
                >
                  <h2 className="text-lg font-semibold text-theme-text">{trackLabel(track)} track</h2>
                  <p className="mt-1 text-sm text-theme-text-muted">
                    {track === "primary"
                      ? "P1–P7 promotion and graduation at P7."
                      : "S1–S6 promotion. S4 graduates from O-Level; S5 enrollment is manual."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {active ? (
                      <LoadingButton
                        loading={saving}
                        variant="primary"
                        onClick={() => void openSession(active)}
                      >
                        Resume (step {active.currentStep})
                      </LoadingButton>
                    ) : (
                      <LoadingButton
                        loading={saving}
                        variant="primary"
                        onClick={() => void beginTrack(track)}
                      >
                        Start {trackLabel(track).toLowerCase()} rollover
                      </LoadingButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {history.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-theme-text">Recent rollovers</h3>
              <DataTable embedded>
                <thead>
                  <tr>
                    <th>Track</th>
                    <th>Years</th>
                    <th>When</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 8).map((row) => (
                    <tr key={row.id}>
                      <td>{trackLabel(row.track)}</td>
                      <td>
                        {row.fromYear} → {row.toYear}
                      </td>
                      <td>{row.performedAt ? new Date(row.performedAt).toLocaleString() : "—"}</td>
                      <td className="max-w-md truncate">{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ) : null}
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      embedded
      eyebrow="Settings"
      title={`${trackLabel(session.track)} year rollover`}
      description="Progress is saved on the server. Nothing is committed until you confirm on the last step."
      maxWidth="7xl"
    >
      <div className="space-y-6">
        <ol className="flex flex-wrap gap-2">
          {STEP_LABELS.map((label, index) => {
            const n = index + 1;
            const active = n === step;
            const done = n < step;
            return (
              <li
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active
                    ? "bg-theme-primary text-white"
                    : done
                      ? "bg-theme-primary/15 text-theme-primary"
                      : "bg-theme-muted text-theme-text-muted"
                }`}
              >
                {n}. {label}
              </li>
            );
          })}
        </ol>

        {error ? (
          <div className="rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">{error}</div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">New academic year</span>
              <input
                type="number"
                className="ms-input w-full"
                value={draft.newYear?.year ?? ""}
                onChange={(e) =>
                  setSession({
                    ...session,
                    draft: {
                      ...draft,
                      newYear: {
                        year: Number(e.target.value),
                        terms: draft.newYear?.terms || [],
                      },
                    },
                  })
                }
              />
            </label>
            <div className="space-y-3">
              {(draft.newYear?.terms || []).map((term, idx) => (
                <div key={`${term.name}-${idx}`} className="grid gap-2 md:grid-cols-3">
                  <input
                    className="ms-input w-full"
                    value={term.name}
                    onChange={(e) => {
                      const terms = [...(draft.newYear?.terms || [])];
                      terms[idx] = { ...terms[idx], name: e.target.value };
                      setSession({
                        ...session,
                        draft: {
                          ...draft,
                          newYear: { year: draft.newYear?.year || new Date().getFullYear(), terms },
                        },
                      });
                    }}
                  />
                  <input
                    type="date"
                    className="ms-input w-full"
                    value={term.startDate || ""}
                    onChange={(e) => {
                      const terms = [...(draft.newYear?.terms || [])];
                      terms[idx] = { ...terms[idx], startDate: e.target.value };
                      setSession({
                        ...session,
                        draft: {
                          ...draft,
                          newYear: { year: draft.newYear?.year || new Date().getFullYear(), terms },
                        },
                      });
                    }}
                  />
                  <input
                    type="date"
                    className="ms-input w-full"
                    value={term.endDate || ""}
                    onChange={(e) => {
                      const terms = [...(draft.newYear?.terms || [])];
                      terms[idx] = { ...terms[idx], endDate: e.target.value };
                      setSession({
                        ...session,
                        draft: {
                          ...draft,
                          newYear: { year: draft.newYear?.year || new Date().getFullYear(), terms },
                        },
                      });
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-theme-text-muted">
              Term dates are pre-filled by shifting last year forward 52 weeks. Adjust as needed.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <QueryState
            isLoading={previewLoading}
            error={null}
            data={promotion ?? undefined}
            loading={<SkeletonTable rows={8} />}
            empty={<EmptyState title="No active students" description="No students found for this track." />}
            isEmpty={(d) => !d || d.students.length === 0}
          >
            {(data) => (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ms-btn-ghost rounded-lg px-3 py-1.5 text-sm" onClick={approveAllPromotions}>
                    Approve all promotions
                  </button>
                  <button
                    type="button"
                    className="ms-btn-ghost rounded-lg px-3 py-1.5 text-sm"
                    onClick={() =>
                      overrideSelectedRepeat(
                        data.students
                          .filter((s) => effectiveAction(s.studentId, s.proposedAction) === "promote")
                          .map((s) => s.studentId),
                      )
                    }
                  >
                    Set all promotions to repeat
                  </button>
                </div>
                <p className="text-sm text-theme-text-muted">
                  {data.summary.promote} promote · {data.summary.graduate} graduate · {data.summary.noPath}{" "}
                  need attention
                  {session.track === "secondary"
                    ? " · S4 graduates from O-Level (S5 enrollment is manual)"
                    : null}
                </p>
                <DataTable embedded minWidth="56rem">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Current</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((row) => {
                      const action = effectiveAction(row.studentId, row.proposedAction);
                      return (
                        <tr key={row.studentId}>
                          <td>
                            <div className="font-medium">{row.fullName}</div>
                            <div className="text-xs text-theme-text-muted">{row.learnerId}</div>
                          </td>
                          <td>{row.currentClassLabel}</td>
                          <td>
                            <select
                              className="ms-input w-full"
                              value={action}
                              onChange={(e) => {
                                const next = e.target.value as StudentDecisionDraft["action"];
                                setStudentAction(
                                  row.studentId,
                                  next,
                                  next === "promote"
                                    ? row.proposedClassId
                                    : next === "repeat"
                                      ? row.currentClassId
                                      : null,
                                );
                              }}
                            >
                              <option value="promote" disabled={!row.proposedClassId && row.proposedAction !== "promote"}>
                                Promote
                              </option>
                              <option value="repeat">Repeat</option>
                              <option value="graduate">Graduate</option>
                            </select>
                          </td>
                          <td>
                            {action === "promote"
                              ? row.proposedClassLabel || "—"
                              : action === "repeat"
                                ? row.currentClassLabel
                                : "—"}
                          </td>
                          <td className="max-w-xs text-sm text-theme-text-muted">{row.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
            )}
          </QueryState>
        ) : null}

        {step === 3 ? (
          <QueryState
            isLoading={previewLoading}
            error={null}
            data={teachers ?? undefined}
            loading={<SkeletonTable rows={6} />}
            empty={<EmptyState title="No teacher assignments" description="Nothing to roll forward for this track." />}
            isEmpty={(d) => !d || d.assignments.length === 0}
          >
            {(data) => {
              const selected = new Set(
                draft.teacherAssignmentIds ??
                  data.assignments.filter((a) => a.mappable).map((a) => a.assignmentId),
              );
              return (
                <div className="space-y-3">
                  <p className="text-sm text-theme-text-muted">
                    {data.summary.mappable} mappable · {data.summary.unmapped} terminal/unmapped (not copied)
                  </p>
                  <DataTable embedded minWidth="50rem">
                    <thead>
                      <tr>
                        <th>Include</th>
                        <th>Teacher</th>
                        <th>Subject</th>
                        <th>From → To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.assignments.map((row) => (
                        <tr key={row.assignmentId}>
                          <td>
                            <input
                              type="checkbox"
                              disabled={!row.mappable}
                              checked={row.mappable && selected.has(row.assignmentId)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(row.assignmentId);
                                else next.delete(row.assignmentId);
                                setSession({
                                  ...session,
                                  draft: { ...draft, teacherAssignmentIds: [...next] },
                                });
                              }}
                            />
                          </td>
                          <td>{row.teacherName}</td>
                          <td>{row.subjectName || "Class teacher"}</td>
                          <td>
                            {row.fromClassLabel}
                            {row.toClassLabel ? ` → ${row.toClassLabel}` : " (no map)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              );
            }}
          </QueryState>
        ) : null}

        {step === 4 ? (
          <QueryState
            isLoading={previewLoading}
            error={null}
            data={fees ?? undefined}
            loading={<SkeletonTable rows={5} />}
            empty={<EmptyState title="No fee structures" description="No active fee structures for this track." />}
            isEmpty={(d) => !d || d.structures.length === 0}
          >
            {(data) => {
              const selected = new Set(draft.feeStructureIds ?? data.structures.map((s) => s.structureId));
              const pct = draft.feePercentIncrease ?? 0;
              return (
                <div className="space-y-4">
                  <label className="flex max-w-xs flex-col gap-1 text-sm">
                    <span className="font-medium">Increase all amounts by %</span>
                    <input
                      type="number"
                      className="ms-input w-full"
                      value={pct}
                      onChange={(e) =>
                        setSession({
                          ...session,
                          draft: { ...draft, feePercentIncrease: Number(e.target.value) || 0 },
                        })
                      }
                    />
                  </label>
                  <DataTable embedded minWidth="44rem">
                    <thead>
                      <tr>
                        <th>Include</th>
                        <th>Class</th>
                        <th>Term</th>
                        <th>Current</th>
                        <th>New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.structures.map((row) => (
                        <tr key={row.structureId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(row.structureId)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(row.structureId);
                                else next.delete(row.structureId);
                                setSession({
                                  ...session,
                                  draft: { ...draft, feeStructureIds: [...next] },
                                });
                              }}
                            />
                          </td>
                          <td>{row.classLabel}</td>
                          <td>{row.termName}</td>
                          <td>{formatMoney(row.amount)}</td>
                          <td>{formatMoney(Math.round(row.amount * (1 + pct / 100)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              );
            }}
          </QueryState>
        ) : null}

        {step === 5 ? (
          <QueryState
            isLoading={previewLoading}
            error={null}
            data={timetable ?? undefined}
            loading={<SkeletonTable rows={4} />}
            empty={
              <EmptyState
                title="No timetable periods"
                description="You can continue without copying a timetable."
              />
            }
            isEmpty={() => false}
          >
            {(data) => (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.timetable?.include !== false}
                    onChange={(e) =>
                      setSession({
                        ...session,
                        draft: {
                          ...draft,
                          timetable: {
                            include: e.target.checked,
                            sourceTermId: data.sourceTermId,
                          },
                        },
                      })
                    }
                  />
                  Copy timetable into Term 1 of the new year (level-shifted)
                </label>
                {data.terms.length > 0 ? (
                  <label className="flex max-w-sm flex-col gap-1 text-sm">
                    <span className="font-medium">Source term</span>
                    <select
                      className="ms-input w-full"
                      value={draft.timetable?.sourceTermId || data.sourceTermId || ""}
                      onChange={(e) => {
                        const sourceTermId = e.target.value || null;
                        setSession({
                          ...session,
                          draft: {
                            ...draft,
                            timetable: {
                              include: draft.timetable?.include !== false,
                              sourceTermId,
                            },
                          },
                        });
                        void fetchTimetablePreview(
                          session.track,
                          session.fromAcademicYearId,
                          sourceTermId,
                        ).then((tt) =>
                          setTimetable({
                            sourceTermId: tt.sourceTermId,
                            terms: tt.terms,
                            summary: tt.summary,
                          }),
                        );
                      }}
                    >
                      {data.terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <p className="text-sm text-theme-text-muted">
                  {data.summary.mappable} periods will be copied · {data.summary.unmapped} skipped
                  (terminal levels)
                </p>
              </div>
            )}
          </QueryState>
        ) : null}

        {step === 6 ? (
          <div className="space-y-4">
            <StatusBanner
              tone="info"
              message="This action cannot be undone. The new academic year will be created and students will be moved. Historical data from the previous year will not be affected."
            />
            <ul className="space-y-2 text-sm text-theme-text">
              <li>
                <strong>New year:</strong> {draft.newYear?.year}
              </li>
              <li>
                <strong>Track:</strong> {trackLabel(session.track)}
              </li>
              <li>
                <strong>Students:</strong> decisions saved for{" "}
                {Object.keys(draft.studentDecisions || {}).length || "all (defaults)"} overrides
              </li>
              <li>
                <strong>Teacher assignments:</strong>{" "}
                {(draft.teacherAssignmentIds ?? teachers?.assignments.filter((a) => a.mappable) ?? [])
                  .length || 0}
              </li>
              <li>
                <strong>Fee structures:</strong>{" "}
                {(draft.feeStructureIds ?? fees?.structures ?? []).length || 0}
                {draft.feePercentIncrease
                  ? ` (+${draft.feePercentIncrease}%)`
                  : ""}
              </li>
              <li>
                <strong>Timetable:</strong>{" "}
                {draft.timetable?.include === false ? "Skip" : "Copy to Term 1"}
              </li>
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-4">
          <div className="flex gap-2">
            <button type="button" className="ms-btn-ghost rounded-xl px-4 py-2" disabled={saving || step === 1} onClick={() => void goBack()}>
              Back
            </button>
            <button type="button" className="ms-btn-ghost rounded-xl px-4 py-2 text-theme-danger" disabled={saving} onClick={() => void cancelActive()}>
              Cancel rollover
            </button>
          </div>
          <LoadingButton loading={saving || executing} variant="primary" onClick={() => void goNext()}>
            {step === 6 ? "Confirm and start new year" : "Continue"}
          </LoadingButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm year rollover"
        description="This creates the new academic year and applies student, teacher, fee, and timetable changes in one transaction. Historical records stay intact."
        confirmLabel="Confirm and start new year"
        variant="danger"
        loading={executing}
        onCancel={() => {
          if (!executing) setConfirmOpen(false);
        }}
        onConfirm={() => void runExecute()}
      />
    </DashboardPage>
  );
}
