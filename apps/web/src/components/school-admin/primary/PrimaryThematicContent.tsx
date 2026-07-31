"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { isLowerPrimaryLevel, schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses, usePrimaryRoster } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { primaryKeys } from "@/hooks/usePrimary";

export function PrimaryThematicContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const search = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const lowerClasses = useMemo(
    () => classes.filter((c) => isLowerPrimaryLevel(c.level)),
    [classes],
  );

  const [classId, setClassId] = useState(search.get("classId") ?? "");
  const [themeId, setThemeId] = useState("");
  const [strand, setStrand] = useState("Literacy");
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selected = lowerClasses.find((c) => c.id === classId);
  const { data: roster = [], isPending } = usePrimaryRoster(classId, offers && !!classId);
  const { data: themeData } = useQuery({
    queryKey: primaryKeys.themes(selected?.level),
    queryFn: () => primaryApi.themes(selected?.level),
    enabled: offers && !!selected,
  });

  useEffect(() => {
    if (!classId && lowerClasses[0]) setClassId(lowerClasses[0].id);
  }, [lowerClasses, classId]);

  useEffect(() => {
    if (!themeId && themeData?.themes[0]) setThemeId(themeData.themes[0].id);
  }, [themeData, themeId]);

  useEffect(() => {
    if (themeData?.strands?.length && !themeData.strands.includes(strand)) {
      setStrand(themeData.strands[0]);
    }
  }, [themeData, strand]);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Thematic assessment">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function save() {
    if (!classId || !themeId || !term?.id) return;
    setSaving(true);
    try {
      await primaryApi.bulkThematic({
        classId,
        themeId,
        strand,
        termId: term.id,
        assessments: roster.map((s) => ({
          studentId: s.id,
          level: Number(levels[s.id] || 3),
        })),
      });
      toast.success(`Saved ${strand} levels for ${roster.length} students.`);
      await qc.invalidateQueries({ queryKey: ["primary"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Thematic assessment"
      description="P1–P3 competence levels (1 Poor – 4 Excellent)."
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
              onChange={(e) => setClassId(e.target.value)}
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
              Theme
            </span>
            <select
              className="ms-input w-full"
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
            >
              {(themeData?.themes ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Strand
            </span>
            <select
              className="ms-input w-full"
              value={strand}
              onChange={(e) => setStrand(e.target.value)}
            >
              {(themeData?.strands ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!lowerClasses.length ? (
          <EmptyState title="No P1–P3 classes" description="Create lower primary classes first." />
        ) : isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-theme">
              <table className="min-w-full text-sm">
                <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {roster.map((s) => (
                    <tr key={s.id} className="bg-theme-surface">
                      <td className="px-3 py-2 font-medium text-theme-primary">{s.fullName}</td>
                      <td className="px-3 py-2">
                        <select
                          className="ms-input"
                          value={levels[s.id] ?? "3"}
                          onChange={(e) =>
                            setLevels((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                        >
                          <option value="4">4 — Excellent</option>
                          <option value="3">3 — Good</option>
                          <option value="2">2 — Fair</option>
                          <option value="1">1 — Poor</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LoadingButton loading={saving} onClick={() => void save()}>
              Save theme strand ({roster.length})
            </LoadingButton>
          </>
        )}
      </div>
    </DashboardPage>
  );
}
