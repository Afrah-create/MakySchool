"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  { value: "4", label: "4 E" },
  { value: "3", label: "3 G" },
  { value: "2", label: "2 F" },
  { value: "1", label: "1 P" },
] as const;

const EMPTY_ROSTER: Array<{ id: string; fullName: string; learnerId: string | null }> = [];
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

type CellDraft = { level: string; comment: string };

function cellKey(studentId: string, themeId: string) {
  return `${studentId}:${themeId}`;
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
  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  const [baseline, setBaseline] = useState<Record<string, CellDraft>>({});
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
    queryKey: primaryKeys.thematic(classId, term?.id ?? "", sittingId || undefined),
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
    if (sittingId && sittings.length && !sittings.some((s) => s.id === sittingId)) {
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

    const next: Record<string, CellDraft> = {};
    for (const student of roster) {
      for (const theme of themes) {
        const key = cellKey(student.id, theme.id);
        const row = existing.find(
          (r) =>
            r.studentId === student.id &&
            r.themeId === theme.id &&
            r.strand === strand,
        );
        next[key] = {
          level: row ? String(row.level) : "3",
          comment: row?.teacherComment ?? "",
        };
      }
    }
    setDrafts(next);
    setBaseline(next);
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

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const [key, cell] of Object.entries(drafts)) {
      const base = baseline[key];
      if (!base) {
        n += 1;
        continue;
      }
      if (base.level !== cell.level || base.comment !== cell.comment) n += 1;
    }
    return n;
  }, [drafts, baseline]);

  const progress = useMemo(() => {
    if (!themes.length || !roster.length || !strands.length) {
      return { filled: 0, total: 0 };
    }
    const total = roster.length * themes.length * strands.length;
    const filled = existing.length;
    return { filled, total };
  }, [existing, roster, themes, strands]);

  function updateCell(key: string, patch: Partial<CellDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { level: prev[key]?.level ?? "3", comment: prev[key]?.comment ?? "", ...patch },
    }));
  }

  function fillColumn(themeId: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const student of roster) {
        const key = cellKey(student.id, themeId);
        next[key] = {
          level: fillLevel,
          comment: next[key]?.comment ?? "",
        };
      }
      return next;
    });
  }

  function fillStrandSheet() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const student of roster) {
        for (const theme of themes) {
          const key = cellKey(student.id, theme.id);
          next[key] = {
            level: fillLevel,
            comment: next[key]?.comment ?? "",
          };
        }
      }
      return next;
    });
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
    const assessments = roster.flatMap((student) =>
      themes.map((theme) => {
        const cell = drafts[cellKey(student.id, theme.id)] ?? {
          level: "3",
          comment: "",
        };
        return {
          studentId: student.id,
          themeId: theme.id,
          strand,
          level: Number(cell.level || 3),
          teacherComment: cell.comment.trim() || null,
        };
      }),
    );
    setSaving(true);
    try {
      const result = await primaryApi.bulkThematicSheet({
        classId,
        termId: term.id,
        sittingId,
        assessments,
      });
      toast.success(
        `Saved ${result.saved} cells for ${strand} (${themes.length} themes × ${roster.length} learners).`,
      );
      await qc.invalidateQueries({ queryKey: ["primary", "thematic"] });
      setBaseline(drafts);
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
      toast.success(`Submitted and locked ${result.submitted} assessment rows.`);
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

  // Admin: lifecycle/progress only — no mark entry
  if (!isTeacher) {
    return (
      <DashboardPage
        embedded
        maxWidth="5xl"
        eyebrow="Primary"
        title="Thematic progress"
        description="Teachers enter competence levels and theme comments. Admins open sittings, unlock if needed, then approve report cards."
        actions={
          <Link href="/dashboard/primary/sittings" className="ms-btn-primary text-sm">
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
                <Link href="/dashboard/primary/sittings" className="ms-btn-primary">
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
              <p className="text-sm text-theme-muted">
                Teachers enter levels and theme comments on the teacher thematic
                grade sheet. After they submit, approve reports under Report cards.
              </p>
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

  const loading = rosterPending || themesPending || (sittingId && marksPending);

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Thematic grade sheet"
      description="Enter competence levels (1–4) and a short comment per theme for the selected strand. Save often; submit when the sitting is complete."
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
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
                Fill level
              </span>
              <select
                className="ms-input"
                value={fillLevel}
                onChange={(e) => setFillLevel(e.target.value)}
                disabled={!canEdit}
              >
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ms-btn-secondary text-sm"
              disabled={!canEdit || !themes.length}
              onClick={fillStrandSheet}
            >
              Fill strand
            </button>
          </div>
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

            <div className="flex flex-wrap gap-1.5">
              {strands.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    strand === s
                      ? "bg-theme-accent text-white"
                      : "bg-theme-raised text-theme-secondary hover:bg-theme-raised/80"
                  }`}
                  onClick={() => setStrand(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <p className="text-xs text-theme-muted">
              Strand: <strong className="text-theme-primary">{strand}</strong>
              {" · "}
              {themes.length} themes × {roster.length} learners
              {dirtyCount > 0 ? ` · ${dirtyCount} unsaved changes` : ""}
              {" · "}
              Levels: 4 Excellent · 3 Good · 2 Fair · 1 Poor
            </p>

            <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-table-header text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                    <tr>
                      <th className="sticky left-0 z-20 bg-table-header px-3 py-2.5 text-left">
                        Student
                      </th>
                      {themes.map((theme) => (
                        <th
                          key={theme.id}
                          className="min-w-[9.5rem] px-2 py-2.5 text-center align-bottom"
                          title={theme.name}
                        >
                          <span className="block max-w-[9rem] truncate normal-case">
                            {theme.name}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="mt-1 text-[10px] font-medium normal-case text-theme-accent hover:underline"
                              onClick={() => fillColumn(theme.id)}
                            >
                              Fill col
                            </button>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((student) => (
                      <tr key={student.id} className="border-t border-theme">
                        <td className="sticky left-0 z-10 bg-theme-surface px-3 py-2">
                          <p className="font-medium text-theme-primary">
                            {student.fullName}
                          </p>
                          <p className="font-mono text-[11px] text-theme-muted">
                            {student.learnerId || "—"}
                          </p>
                        </td>
                        {themes.map((theme) => {
                          const key = cellKey(student.id, theme.id);
                          const cell = drafts[key] ?? { level: "3", comment: "" };
                          return (
                            <td
                              key={theme.id}
                              className="px-1.5 py-2 align-top"
                            >
                              <div className="flex flex-col gap-1">
                                <select
                                  className="ms-input w-full text-center text-xs"
                                  disabled={!canEdit}
                                  value={cell.level}
                                  onChange={(e) =>
                                    updateCell(key, { level: e.target.value })
                                  }
                                  aria-label={`${student.fullName} ${theme.name} level`}
                                >
                                  {LEVEL_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="ms-input w-full text-xs"
                                  disabled={!canEdit}
                                  placeholder="Comment"
                                  maxLength={500}
                                  value={cell.comment}
                                  onChange={(e) =>
                                    updateCell(key, { comment: e.target.value })
                                  }
                                  aria-label={`${student.fullName} ${theme.name} comment`}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LoadingButton
                loading={saving}
                disabled={!canEdit || themes.length === 0}
                onClick={() => void saveSheet()}
              >
                Save {strand} sheet
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
              ) : null}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={submitOpen}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void submitSitting()}
        title="Submit thematic sitting?"
        description="Learners’ levels and theme comments will be locked. An admin must unlock the sitting before further edits."
        confirmLabel="Submit & lock"
        variant="danger"
        loading={submitting || saving}
      />
    </DashboardPage>
  );
}
