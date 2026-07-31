"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary, type PleGrade } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses, usePrimaryRoster, primaryKeys } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const PLE_GRADES: PleGrade[] = ["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8", "F9"];
const EMPTY_ROSTER: Array<{ id: string; fullName: string; learnerId: string | null }> = [];

type PleDraft = {
  indexNumber: string;
  english: PleGrade;
  math: PleGrade;
  science: PleGrade;
  sst: PleGrade;
};

export function PrimaryPleContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: term } = useCurrentTerm();
  const yearId = term?.academicYearId ?? "";
  const { data: classes = [] } = usePrimaryClasses(offers);
  const p7 = useMemo(() => classes.filter((c) => c.level === "P7"), [classes]);
  const [classId, setClassId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PleDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && p7[0]) setClassId(p7[0].id);
  }, [p7, classId]);

  const { data: rosterData } = usePrimaryRoster(classId, offers && !!classId);
  const roster = rosterData ?? EMPTY_ROSTER;
  const { data: pleRows = [], isPending } = useQuery({
    queryKey: primaryKeys.ple(yearId),
    queryFn: () => primaryApi.listPle(yearId),
    enabled: offers && !!yearId,
  });
  const { data: analytics } = useQuery({
    queryKey: [...primaryKeys.ple(yearId), "analytics"],
    queryFn: () => primaryApi.pleAnalytics(yearId) as Promise<{
      total: number;
      divisions: Record<string, number>;
    }>,
    enabled: offers && !!yearId,
  });

  const existing = useMemo(() => {
    const m = new Map(pleRows.map((r) => [r.studentId, r]));
    return m;
  }, [pleRows]);

  const rosterKey = useMemo(() => roster.map((s) => s.id).join("|"), [roster]);
  const pleKey = useMemo(
    () =>
      pleRows
        .map(
          (r) =>
            `${r.studentId}:${r.indexNumber ?? ""}:${r.englishGrade}:${r.mathGrade}:${r.scienceGrade}:${r.sstGrade}`,
        )
        .join("|"),
    [pleRows],
  );

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, PleDraft> = {};
      let changed = Object.keys(prev).length !== roster.length;
      for (const s of roster) {
        const row = existing.get(s.id);
        const draft: PleDraft = {
          indexNumber: row?.indexNumber ?? "",
          english: (row?.englishGrade as PleGrade) || "C4",
          math: (row?.mathGrade as PleGrade) || "C4",
          science: (row?.scienceGrade as PleGrade) || "C4",
          sst: (row?.sstGrade as PleGrade) || "C4",
        };
        next[s.id] = draft;
        const old = prev[s.id];
        if (
          !old ||
          old.indexNumber !== draft.indexNumber ||
          old.english !== draft.english ||
          old.math !== draft.math ||
          old.science !== draft.science ||
          old.sst !== draft.sst
        ) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // rosterKey / pleKey are stable fingerprints; avoid depending on new [] defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey, pleKey]);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="PLE results">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function saveStudent(studentId: string) {
    if (!yearId) {
      toast.error("Academic year is required. Ensure a current term is configured.");
      return;
    }
    const d = drafts[studentId];
    if (!d) return;
    setSavingId(studentId);
    try {
      await primaryApi.upsertPle({
        studentId,
        academicYearId: yearId,
        indexNumber: d.indexNumber || null,
        englishGrade: d.english,
        mathGrade: d.math,
        scienceGrade: d.science,
        sstGrade: d.sst,
      });
      toast.success("PLE result saved.");
      await qc.invalidateQueries({ queryKey: primaryKeys.ple(yearId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="PLE results"
      description="Primary Leaving Examination — national grades (lower aggregate is better)."
    >
      <div className="space-y-4">
        {analytics ? (
          <div className="grid gap-3 sm:grid-cols-5">
            {(["1", "2", "3", "4", "U"] as const).map((d) => (
              <div key={d} className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
                <p className="text-xs text-theme-muted">
                  {d === "U" ? "Ungraded" : `Division ${d}`}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-theme-primary">
                  {analytics.divisions?.[d] ?? 0}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <label className="block max-w-xs">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
            P7 class
          </span>
          <select
            className="ms-input w-full"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {p7.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {!p7.length ? (
          <EmptyState title="No P7 classes" description="Create a P7 class to enter PLE results." />
        ) : !yearId ? (
          <EmptyState
            title="Academic year missing"
            description="Set a current term so PLE results can be linked to an academic year."
          />
        ) : isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Index</th>
                  <th className="px-2 py-2">Eng</th>
                  <th className="px-2 py-2">Math</th>
                  <th className="px-2 py-2">Sci</th>
                  <th className="px-2 py-2">SST</th>
                  <th className="px-2 py-2">Agg</th>
                  <th className="px-2 py-2">Div</th>
                  <th className="px-2 py-2"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {roster.map((s) => {
                  const d = drafts[s.id];
                  const saved = existing.get(s.id);
                  if (!d) return null;
                  return (
                    <tr key={s.id} className="bg-theme-surface">
                      <td className="px-2 py-2 font-medium text-theme-primary">{s.fullName}</td>
                      <td className="px-2 py-2">
                        <input
                          className="ms-input w-24"
                          value={d.indexNumber}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: { ...d, indexNumber: e.target.value },
                            }))
                          }
                        />
                      </td>
                      {(["english", "math", "science", "sst"] as const).map((field) => (
                        <td key={field} className="px-2 py-2">
                          <select
                            className="ms-input"
                            value={d[field]}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...d,
                                  [field]: e.target.value as PleGrade,
                                },
                              }))
                            }
                          >
                            {PLE_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                      <td className="px-2 py-2 tabular-nums">{saved?.aggregate ?? "—"}</td>
                      <td className="px-2 py-2">{saved?.division ?? "—"}</td>
                      <td className="px-2 py-2">
                        <LoadingButton
                          loading={savingId === s.id}
                          className="text-xs"
                          onClick={() => void saveStudent(s.id)}
                        >
                          Save
                        </LoadingButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
