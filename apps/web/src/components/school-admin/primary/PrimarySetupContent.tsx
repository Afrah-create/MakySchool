"use client";

import { useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useEnsurePrimarySetup, usePrimarySetup } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQueryClient } from "@tanstack/react-query";

export function PrimarySetupContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: setup, isPending } = usePrimarySetup(offers);
  const ensure = useEnsurePrimarySetup();
  const [ca, setCa] = useState(30);
  const [exam, setExam] = useState(70);
  const [saving, setSaving] = useState(false);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary setup">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function bootstrap() {
    try {
      await ensure.mutateAsync({ caWeight: ca, examWeight: exam });
      toast.success("Primary module configured.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed.");
    }
  }

  async function saveWeights() {
    if (Math.abs(ca + exam - 100) > 0.01) {
      toast.error("CA and exam weights must sum to 100.");
      return;
    }
    setSaving(true);
    try {
      await primaryApi.patchSetup({ caWeight: ca, examWeight: exam });
      toast.success("Assessment weights updated.");
      await qc.invalidateQueries({ queryKey: ["primary", "setup"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title="Setup"
      description="Grading weights, scale, and default subjects for P1–P7."
    >
      <div className="space-y-6">
        {!setup && !isPending ? (
          <div className="rounded-xl border border-theme bg-theme-surface p-5 space-y-4">
            <p className="text-sm text-theme-muted">
              First-time setup seeds the default Ugandan D/C/P/F scale, core subjects, and
              thematic themes.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">CA weight %</span>
                <input
                  type="number"
                  className="ms-input w-28"
                  value={ca}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCa(v);
                    setExam(100 - v);
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Exam weight %</span>
                <input type="number" className="ms-input w-28" value={exam} readOnly />
              </label>
            </div>
            <LoadingButton loading={ensure.isPending} onClick={() => void bootstrap()}>
              Create primary setup
            </LoadingButton>
          </div>
        ) : setup ? (
          <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
            <h2 className="font-semibold text-theme-primary">{setup.name}</h2>
            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">CA weight %</span>
                <input
                  type="number"
                  className="ms-input w-28"
                  defaultValue={setup.caWeight}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCa(v);
                    setExam(100 - v);
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Exam weight %</span>
                <input
                  type="number"
                  className="ms-input w-28"
                  value={exam === 70 && setup ? 100 - ca : exam}
                  readOnly
                />
              </label>
            </div>
            <LoadingButton loading={saving} onClick={() => void saveWeights()}>
              Save weights
            </LoadingButton>

            <div className="overflow-x-auto pt-4">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase text-theme-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Grade</th>
                    <th className="px-2 py-1 text-left">Label</th>
                    <th className="px-2 py-1 text-left">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {setup.gradeScale.map((g) => (
                    <tr key={g.grade} className="border-t border-theme">
                      <td className="px-2 py-2 font-medium">{g.grade}</td>
                      <td className="px-2 py-2">{g.label}</td>
                      <td className="px-2 py-2 tabular-nums text-theme-muted">
                        {g.minPercent}–{g.maxPercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardPage>
  );
}
