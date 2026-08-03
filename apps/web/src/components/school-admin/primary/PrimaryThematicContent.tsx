"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { isLowerPrimaryLevel, schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCan } from "@/hooks/useCurrentRole";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  primaryKeys,
  usePrimaryClasses,
  usePrimaryRoster,
  usePrimarySittings,
} from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const LEVEL_OPTIONS = [
  { value: "4", label: "4 · Excellent", short: "E" },
  { value: "3", label: "3 · Good", short: "G" },
  { value: "2", label: "2 · Fair", short: "F" },
  { value: "1", label: "1 · Poor", short: "P" },
] as const;

const EMPTY_ROSTER: Array<{
  id: string;
  fullName: string;
  learnerId: string | null;
}> = [];
const EMPTY_THEMES: Array<{ id: string; name: string }> = [];
const EMPTY_STRANDS: string[] = [];
const EMPTY_MARKS: Array<{
  id: string;
  studentId: string;
  themeId: string;
  strand: string;
  level: number;
  teacherComment?: string | null;
  submitted: boolean;
  sittingId?: string | null;
}> = [];

/** Level is null until the teacher explicitly scores the theme. */
type CellDraft = { level: string | null };

function cellKey(studentId: string, themeId: string) {
  return `${studentId}:${themeId}`;
}

function levelShort(level: string | null) {
  if (!level) return "—";
  return LEVEL_OPTIONS.find((o) => o.value === level)?.short ?? level;
}

export function PrimaryThematicContent({
  portal = "auto",
}: {
  portal?: "auto" | "teacher" | "admin";
}) {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canUnlock = useCan("managePrimarySetup");

  const isTeacher =
    portal === "teacher" ||
    (portal === "auto" && pathname?.startsWith("/teacher"));

  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const lowerClasses = useMemo(
    () => classes.filter((c) => isLowerPrimaryLevel(c.level)),
    [classes],
  );

  const [classId, setClassId] = useState(search.get("classId") ?? "");
  const [sittingId, setSittingId] = useState(search.get("sittingId") ?? "");
  const [strand, setStrand] = useState("");
  const [studentId, setStudentId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  const [baseline, setBaseline] = useState<Record<string, CellDraft>>({});
  /** One optional comment per learner for the active strand. */
  const [strandComments, setStrandComments] = useState<Record<string, string>>(
    {},
  );
  const [baselineComments, setBaselineComments] = useState<
    Record<string, string>
  >({});
  const [fillLevel, setFillLevel] = useState("3");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const selected = lowerClasses.find((c) => c.id === classId);
  const { data: rosterData, isPending: rosterPending } = usePrimaryRoster(
    classId,
    offers && !!classId,
  );
  const roster = rosterData ?? EMPTY_ROSTER;
  const { data: sittings = [] } = usePrimarySittings(
    { classId: classId || undefined, termId: term?.id },
    offers && !!classId && !!term?.id,
  );

  const openSittings = useMemo(
    () => sittings.filter((s) => !s.deleted && s.status === "open"),
    [sittings],
  );
  const activeSitting = sittings.find((s) => s.id === sittingId && !s.deleted);

  const { data: themeData, isPending: themesPending } = useQuery({
    queryKey: primaryKeys.themes(selected?.level),
    queryFn: () => primaryApi.themes(selected?.level),
    enabled: offers && !!selected,
  });

  const themes = themeData?.themes ?? EMPTY_THEMES;
  const strands = themeData?.strands ?? EMPTY_STRANDS;

  const { data: existingData, isPending: marksPending } = useQuery({
    queryKey: primaryKeys.thematic(
      classId,
      term?.id ?? "",
      sittingId || undefined,
    ),
    queryFn: () => {
      if (!term?.id) throw new Error("Term is required.");
      return primaryApi.listThematic({
        classId,
        termId: term.id,
        sittingId: sittingId || undefined,
      });
    },
    enabled: offers && !!classId && !!term?.id && !!sittingId,
  });
  const existing = existingData ?? EMPTY_MARKS;

  useEffect(() => {
    if (!classId && lowerClasses[0]) setClassId(lowerClasses[0].id);
  }, [lowerClasses, classId]);

  useEffect(() => {
    if (!sittingId && openSittings[0]) {
      setSittingId(openSittings[0].id);
      return;
    }
    if (
      sittingId &&
      sittings.length &&
      !sittings.some((s) => s.id === sittingId)
    ) {
      setSittingId(openSittings[0]?.id ?? "");
    }
  }, [openSittings, sittings, sittingId]);

  useEffect(() => {
    if (!strand && strands[0]) setStrand(strands[0]);
    else if (strand && strands.length && !strands.includes(strand)) {
      setStrand(strands[0] ?? "");
    }
  }, [strands, strand]);

  useEffect(() => {
    if (!roster.length) {
      setStudentId("");
      return;
    }
    if (!studentId || !roster.some((r) => r.id === studentId)) {
      setStudentId(roster[0]!.id);
    }
  }, [roster, studentId]);

  useEffect(() => {
    const currentClassId = search.get("classId") ?? "";
    const currentSittingId = search.get("sittingId") ?? "";
    if (currentClassId === classId && currentSittingId === sittingId) return;
    const q = new URLSearchParams();
    if (classId) q.set("classId", classId);
    if (sittingId) q.set("sittingId", sittingId);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [classId, sittingId, pathname, router, search]);

  const hydrateKey = useMemo(() => {
    if (!sittingId || !strand || !themes.length) return "";
    const rosterPart = roster.map((r) => r.id).join(",");
    const themePart = themes.map((t) => t.id).join(",");
    const marksPart = existing
      .filter((r) => r.strand === strand)
      .map(
        (r) =>
          `${r.studentId}:${r.themeId}:${r.level}:${r.teacherComment ?? ""}:${r.submitted ? 1 : 0}`,
      )
      .join("|");
    return `${sittingId}|${strand}|${rosterPart}|${themePart}|${marksPart}`;
  }, [sittingId, strand, roster, themes, existing]);

  useEffect(() => {
    if (!hydrateKey || !themes.length || !strand) return;
    if (sittingId && marksPending) return;

    const nextDrafts: Record<string, CellDraft> = {};
    const nextComments: Record<string, string> = {};

    for (const student of roster) {
      const studentRows = existing.filter(
        (r) => r.studentId === student.id && r.strand === strand,
      );
      // Prefer first non-empty comment for this learner × strand.
      const comment =
        studentRows.find((r) => r.teacherComment?.trim())?.teacherComment ??
        "";
      nextComments[student.id] = comment;

      for (const theme of themes) {
        const key = cellKey(student.id, theme.id);
        const row = studentRows.find((r) => r.themeId === theme.id);
        nextDrafts[key] = {
          level: row ? String(row.level) : null,
        };
      }
    }
    setDrafts(nextDrafts);
    setBaseline(nextDrafts);
    setStrandComments(nextComments);
    setBaselineComments(nextComments);
    // Intentionally keyed by hydrateKey to avoid reference-driven loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateKey, marksPending]);

  const locked = useMemo(() => {
    if (!strand) return false;
    return existing.some((r) => r.strand === strand && r.submitted);
  }, [existing, strand]);

  const canEdit =
    isTeacher &&
    !!activeSitting &&
    activeSitting.status === "open" &&
    !locked;

  const strandProgress = useMemo(() => {
    return strands.map((s) => {
      const scored = new Set(
        existing
          .filter((r) => r.strand === s)
          .map((r) => `${r.studentId}:${r.themeId}`),
      );
      const total = roster.length * themes.length;
      let filled = scored.size;
      // Include unsaved drafts for the active strand.
      if (s === strand) {
        filled = 0;
        for (const student of roster) {
          for (const theme of themes) {
            const cell = drafts[cellKey(student.id, theme.id)];
            if (cell?.level) filled += 1;
          }
        }
      }
      return {
        name: s,
        filled,
        total,
        complete: total > 0 && filled >= total,
      };
    });
  }, [strands, existing, roster, themes, strand, drafts]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const [key, cell] of Object.entries(drafts)) {
      const base = baseline[key];
      if (!base) {
        if (cell.level) n += 1;
        continue;
      }
      if (base.level !== cell.level) n += 1;
    }
    for (const student of roster) {
      const cur = (strandComments[student.id] ?? "").trim();
      const base = (baselineComments[student.id] ?? "").trim();
      if (cur !== base) n += 1;
    }
    return n;
  }, [drafts, baseline, strandComments, baselineComments, roster]);

  const progress = useMemo(() => {
    if (!themes.length || !roster.length || !strands.length) {
      return { filled: 0, total: 0 };
    }
    const total = roster.length * themes.length * strands.length;
    const filled = existing.length;
    return { filled, total };
  }, [existing, roster, themes, strands]);

  const activeStudent = roster.find((r) => r.id === studentId) ?? null;
  const studentIndex = roster.findIndex((r) => r.id === studentId);

  const studentScoredCount = useMemo(() => {
    if (!studentId) return 0;
    return themes.filter((t) => drafts[cellKey(studentId, t.id)]?.level)
      .length;
  }, [studentId, themes, drafts]);

  function updateLevel(themeId: string, level: string | null) {
    if (!studentId) return;
    const key = cellKey(studentId, themeId);
    setDrafts((prev) => ({
      ...prev,
      [key]: { level },
    }));
  }

  function fillStudentThemes() {
    if (!studentId || !canEdit) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const theme of themes) {
        next[cellKey(studentId, theme.id)] = { level: fillLevel };
      }
      return next;
    });
  }

  function goStudent(delta: number) {
    if (!roster.length) return;
    const idx = Math.max(0, studentIndex);
    const next = (idx + delta + roster.length) % roster.length;
    setStudentId(roster[next]!.id);
  }

  async function saveSheet(): Promise<boolean> {
    if (!classId || !term?.id || !sittingId || !strand) {
      toast.error("Select class, sitting, and strand.");
      return false;
    }
    if (!canEdit) {
      toast.error("This sitting is not open for assessment.");
      return false;
    }

    // Save only scored cells (and comment changes for scored themes).
    const assessments: Array<{
      studentId: string;
      themeId: string;
      strand: string;
      level: number;
      teacherComment: string | null;
    }> = [];

    for (const student of roster) {
      const comment = (strandComments[student.id] ?? "").trim() || null;
      const baseComment = (baselineComments[student.id] ?? "").trim() || null;
      const commentChanged = comment !== baseComment;

      // One comment per learner×strand — attach to the first scored theme only.
      const canonicalThemeId = themes.find(
        (t) => drafts[cellKey(student.id, t.id)]?.level,
      )?.id;

      for (const theme of themes) {
        const key = cellKey(student.id, theme.id);
        const cell = drafts[key];
        const base = baseline[key];
        if (!cell?.level) continue;
        const levelChanged = !base || base.level !== cell.level;
        const isCanonical = theme.id === canonicalThemeId;
        const shouldWriteComment =
          isCanonical && (commentChanged || levelChanged || !base);
        if (!levelChanged && !shouldWriteComment) continue;
        assessments.push({
          studentId: student.id,
          themeId: theme.id,
          strand,
          level: Number(cell.level),
          teacherComment: isCanonical ? comment : null,
        });
      }

      // Comment-only change with existing levels: force update canonical row.
      if (
        commentChanged &&
        canonicalThemeId &&
        !assessments.some(
          (a) =>
            a.studentId === student.id && a.themeId === canonicalThemeId,
        )
      ) {
        const cell = drafts[cellKey(student.id, canonicalThemeId)];
        if (cell?.level) {
          assessments.push({
            studentId: student.id,
            themeId: canonicalThemeId,
            strand,
            level: Number(cell.level),
            teacherComment: comment,
          });
        }
      }
    }

    if (assessments.length === 0) {
      toast.success("Nothing new to save.");
      return true;
    }

    setSaving(true);
    try {
      const result = await primaryApi.bulkThematicSheet({
        classId,
        termId: term.id,
        sittingId,
        assessments,
      });
      toast.success(`Saved ${result.saved} assessment${result.saved === 1 ? "" : "s"}.`);
      await qc.invalidateQueries({ queryKey: ["primary", "thematic"] });
      setBaseline(drafts);
      setBaselineComments(strandComments);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitSitting() {
    if (!sittingId) return;
    setSubmitting(true);
    try {
      if (dirtyCount > 0 && canEdit) {
        const ok = await saveSheet();
        if (!ok) return;
      }
      const result = await primaryApi.submitThematic(sittingId);
      toast.success(
        `Submitted and locked ${result.submitted} assessment rows.`,
      );
      setSubmitOpen(false);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function unlockSitting() {
    if (!sittingId) return;
    setSubmitting(true);
    try {
      const result = await primaryApi.unlockThematic(sittingId);
      toast.success(`Unlocked ${result.unlocked} assessment rows.`);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Thematic assessment">
        <EmptyState
          title="Primary not enabled"
          description="Not available for secondary-only schools."
        />
      </DashboardPage>
    );
  }

  if (!isTeacher) {
    return (
      <DashboardPage
        embedded
        maxWidth="5xl"
        eyebrow="Primary"
        title="Thematic progress"
        description="Teachers enter competence levels and a strand comment per learner. Admins open sittings, unlock if needed, then approve report cards."
        actions={
          <Link
            href="/dashboard/primary/sittings"
            className="ms-btn-primary text-sm"
          >
            Manage sittings
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap">
            <label className="block sm:flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
                Class
              </span>
              <select
                className="ms-input w-full"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSittingId("");
                }}
              >
                {lowerClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
                Sitting
              </span>
              <select
                className="ms-input w-full"
                value={sittingId}
                onChange={(e) => setSittingId(e.target.value)}
              >
                <option value="">Select sitting…</option>
                {sittings
                  .filter((s) => !s.deleted)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {!sittingId ? (
            <EmptyState
              title="Select a sitting"
              description="Open sittings for teachers from Thematic sittings, then track completion here."
              action={
                <Link
                  href="/dashboard/primary/sittings"
                  className="ms-btn-primary"
                >
                  Open sittings
                </Link>
              }
            />
          ) : marksPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3 rounded-xl border border-theme bg-theme-surface p-5">
              <p className="text-sm text-theme-secondary">
                <span className="font-semibold text-theme-primary">
                  {activeSitting?.name}
                </span>{" "}
                · {activeSitting?.status}
              </p>
              <p className="text-sm text-theme-muted">
                Assessment cells recorded:{" "}
                <span className="font-medium text-theme-primary">
                  {progress.filled}
                </span>
                {progress.total > 0 ? ` / ${progress.total}` : ""}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {strandProgress.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between rounded-lg border border-theme bg-theme-raised/30 px-3 py-2 text-sm"
                  >
                    <span className="text-theme-primary">{s.name}</span>
                    <span className="tabular-nums text-theme-muted">
                      {s.filled}/{s.total}
                      {s.complete ? (
                        <Check className="ml-1.5 inline h-3.5 w-3.5 text-theme-success" />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {canUnlock ? (
                <LoadingButton
                  loading={submitting}
                  className="ms-btn-secondary"
                  onClick={() => void unlockSitting()}
                >
                  Unlock sitting for re-entry
                </LoadingButton>
              ) : null}
            </div>
          )}
        </div>
      </DashboardPage>
    );
  }

  const loading = rosterPending || themesPending || (!!sittingId && marksPending);

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Thematic grade sheet"
      description="Score one learner at a time. Pick a strand, set theme levels (1–4), add one optional comment, then move to the next learner."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block sm:min-w-[10rem] sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Class
            </span>
            <select
              className="ms-input w-full"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSittingId("");
                setStudentId("");
              }}
            >
              {lowerClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:min-w-[14rem] sm:flex-[1.4]">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Open sitting
            </span>
            <select
              className="ms-input w-full"
              value={sittingId}
              onChange={(e) => setSittingId(e.target.value)}
            >
              <option value="">Select sitting…</option>
              {sittings
                .filter((s) => !s.deleted)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.status}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {!lowerClasses.length ? (
          <EmptyState
            title="No P1–P3 classes"
            description="Ask an admin to create lower primary classes."
          />
        ) : !sittingId ? (
          <EmptyState
            title="No sitting selected"
            description="Ask an admin to create and open a thematic sitting for this class."
          />
        ) : loading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            {!canEdit ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-theme-secondary">
                {locked
                  ? "This sitting is submitted and locked. Ask an admin to unlock if you need corrections."
                  : `This sitting is ${activeSitting?.status ?? "unavailable"}. Assessment is only available while the sitting is open.`}
              </p>
            ) : null}

            {/* Strand checklist */}
            <div className="flex flex-wrap gap-1.5">
              {strandProgress.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    strand === s.name
                      ? "bg-theme-accent text-white"
                      : "bg-theme-raised text-theme-secondary hover:bg-theme-raised/80"
                  }`}
                  onClick={() => setStrand(s.name)}
                >
                  {s.complete ? (
                    <Check className="h-3.5 w-3.5 opacity-90" />
                  ) : null}
                  {s.name}
                  <span
                    className={`text-[11px] tabular-nums ${
                      strand === s.name ? "text-white/80" : "text-theme-muted"
                    }`}
                  >
                    {s.filled}/{s.total || "—"}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
              {/* Roster */}
              <aside className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                <div className="border-b border-theme px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                    Learners · {roster.length}
                  </p>
                </div>
                <ul className="max-h-[28rem] overflow-y-auto divide-y divide-[var(--color-border)] lg:max-h-[36rem]">
                  {roster.map((student) => {
                    const scored = themes.filter(
                      (t) => drafts[cellKey(student.id, t.id)]?.level,
                    ).length;
                    const done = themes.length > 0 && scored >= themes.length;
                    const active = student.id === studentId;
                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                            active
                              ? "bg-theme-accent-muted"
                              : "hover:bg-theme-raised/40"
                          }`}
                          onClick={() => setStudentId(student.id)}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                              done
                                ? "bg-theme-success-bg text-theme-success"
                                : scored > 0
                                  ? "bg-theme-warning-bg text-theme-warning"
                                  : "bg-theme-raised text-theme-muted"
                            }`}
                          >
                            {done ? <Check className="h-3 w-3" /> : scored}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-theme-primary">
                              {student.fullName}
                            </span>
                            <span className="block font-mono text-[10px] text-theme-muted">
                              {student.learnerId || "—"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              {/* Student card */}
              <section className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
                {!activeStudent ? (
                  <EmptyState
                    title="Select a learner"
                    description="Choose someone from the list to begin scoring."
                  />
                ) : (
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-theme-primary">
                          {activeStudent.fullName}
                        </p>
                        <p className="text-xs text-theme-muted">
                          {strand} · {studentScoredCount}/{themes.length} themes
                          scored
                          {studentIndex >= 0
                            ? ` · ${studentIndex + 1} of ${roster.length}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="ms-btn-ghost !px-2.5 !py-1.5"
                          disabled={roster.length < 2}
                          onClick={() => goStudent(-1)}
                          aria-label="Previous learner"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="ms-btn-ghost !px-2.5 !py-1.5"
                          disabled={roster.length < 2}
                          onClick={() => goStudent(1)}
                          aria-label="Next learner"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        {canEdit ? (
                          <>
                            <select
                              className="ms-input !py-1.5 text-xs"
                              value={fillLevel}
                              onChange={(e) => setFillLevel(e.target.value)}
                              aria-label="Fill level"
                            >
                              {LEVEL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="ms-btn-secondary text-xs"
                              onClick={fillStudentThemes}
                            >
                              Fill all themes
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1 p-3 sm:p-4">
                      <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-theme-muted sm:grid">
                        <span>Theme</span>
                        <span className="w-[11.5rem] text-center sm:w-[13rem]">
                          Level
                        </span>
                      </div>
                      {themes.map((theme) => {
                        const key = cellKey(activeStudent.id, theme.id);
                        const level = drafts[key]?.level ?? null;
                        return (
                          <div
                            key={theme.id}
                            className="grid gap-2 rounded-lg border border-theme bg-theme-raised/20 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-theme-primary">
                                {theme.name}
                              </p>
                              <p className="text-[11px] text-theme-muted sm:hidden">
                                Level: {levelShort(level)}
                              </p>
                            </div>
                            <div
                              className="flex flex-wrap gap-1"
                              role="group"
                              aria-label={`${theme.name} level`}
                            >
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => updateLevel(theme.id, null)}
                                className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                                  level === null
                                    ? "bg-theme-raised text-theme-muted ring-1 ring-theme"
                                    : "text-theme-muted hover:bg-theme-raised"
                                }`}
                                title="Clear"
                              >
                                —
                              </button>
                              {LEVEL_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() =>
                                    updateLevel(theme.id, o.value)
                                  }
                                  className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-xs font-semibold tabular-nums transition ${
                                    level === o.value
                                      ? "bg-theme-accent text-white"
                                      : "bg-theme-surface text-theme-secondary ring-1 ring-[var(--color-border)] hover:bg-theme-raised"
                                  }`}
                                  title={o.label}
                                >
                                  {o.short}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-theme px-4 py-3 sm:px-5">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                          Strand comment (optional)
                        </span>
                        <textarea
                          className="ms-input w-full"
                          rows={2}
                          maxLength={500}
                          disabled={!canEdit}
                          placeholder={`Note for ${activeStudent.fullName} · ${strand}`}
                          value={strandComments[activeStudent.id] ?? ""}
                          onChange={(e) =>
                            setStrandComments((prev) => ({
                              ...prev,
                              [activeStudent.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LoadingButton
                loading={saving}
                disabled={!canEdit || themes.length === 0}
                onClick={() => void saveSheet()}
              >
                Save changes
                {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
              </LoadingButton>
              <LoadingButton
                loading={submitting}
                disabled={!sittingId || activeSitting?.status !== "open"}
                className="ms-btn-secondary"
                onClick={() => setSubmitOpen(true)}
              >
                Submit & lock sitting
              </LoadingButton>
              {dirtyCount > 0 ? (
                <span className="text-xs text-theme-muted">
                  Unsaved changes will be saved before submit.
                </span>
              ) : (
                <span className="text-xs text-theme-muted">
                  Levels: E Excellent · G Good · F Fair · P Poor
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={submitOpen}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void submitSitting()}
        title="Submit thematic sitting?"
        description="Learners’ levels and strand comments will be locked. An admin must unlock the sitting before further edits."
        confirmLabel="Submit & lock"
        variant="danger"
        loading={submitting || saving}
      />
    </DashboardPage>
  );
}
