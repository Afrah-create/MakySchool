"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useEnsurePrimarySetup, usePrimarySetup, usePrimarySubjects } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function PrimarySetupContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: setup, isPending } = usePrimarySetup(offers);
  const { data: subjects = [] } = usePrimarySubjects(undefined, offers);
  const ensure = useEnsurePrimarySetup();
  const [ca, setCa] = useState(30);
  const [exam, setExam] = useState(70);
  const [aggregateMode, setAggregateMode] = useState<"ple_points" | "percent">("ple_points");
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newFrom, setNewFrom] = useState("P4");
  const [newTo, setNewTo] = useState("P7");

  useEffect(() => {
    if (!setup) return;
    setCa(setup.caWeight);
    setExam(setup.examWeight);
    setAggregateMode(setup.aggregateMode ?? "ple_points");
  }, [setup]);

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
      await primaryApi.patchSetup({
        caWeight: ca,
        examWeight: exam,
        aggregateMode,
      });
      toast.success("Assessment settings updated.");
      await qc.invalidateQueries({ queryKey: ["primary", "setup"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function installSubjects() {
    setInstalling(true);
    try {
      const result = await primaryApi.installDefaultSubjects();
      toast.success(
        `Subjects ready (${result.created} new). Assign teachers on Teaching load.`,
      );
      await qc.invalidateQueries({ queryKey: ["primary", "subjects"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed.");
    } finally {
      setInstalling(false);
    }
  }

  async function addSubject() {
    if (!newName.trim() || !newCode.trim()) {
      toast.error("Name and code are required.");
      return;
    }
    setAdding(true);
    try {
      await primaryApi.createSubject({
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
        appliesFrom: newFrom,
        appliesTo: newTo,
        subjectType: "core",
      });
      toast.success("Subject added to Primary and the school catalogue.");
      setNewName("");
      setNewCode("");
      await qc.invalidateQueries({ queryKey: ["primary", "subjects"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add subject.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title="Setup"
      description="Install default subjects (including Literacy & Numeracy), grading, and custom subjects."
    >
      <div className="space-y-6">
        {!setup && !isPending ? (
          <div className="rounded-xl border border-theme bg-theme-surface p-5 space-y-4">
            <p className="text-sm text-theme-muted">
              First-time setup seeds the D/C/P/F scale and themes. Then install subjects into
              the school catalogue so Teaching load can assign teachers.
            </p>
            <LoadingButton loading={ensure.isPending} onClick={() => void bootstrap()}>
              Create primary setup
            </LoadingButton>
          </div>
        ) : setup ? (
          <>
            <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
              <h2 className="font-semibold text-theme-primary">Grading · {setup.name}</h2>
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
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">Exam ranking</span>
                  <select
                    className="ms-input"
                    value={aggregateMode}
                    onChange={(e) =>
                      setAggregateMode(e.target.value as "ple_points" | "percent")
                    }
                  >
                    <option value="ple_points">PLE aggregate (D1–F9, best 4–36)</option>
                    <option value="percent">Average percent (D/C/P/F)</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-theme-muted">
                Each exam is graded on its own scores (no averaging across BOT/MID/EOT). CA is
                continuous assessment entered separately — weights apply only if you later generate
                an optional end-of-term combined report. Exam report cards never require CA.
              </p>
              <LoadingButton loading={saving} onClick={() => void saveWeights()}>
                Save settings
              </LoadingButton>
            </div>

            <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-theme-primary">Subjects</h2>
                  <p className="mt-1 text-sm text-theme-muted">
                    Install LIT/NUM (P1–P3) and core P4–P7 subjects into Subjects + Teaching load.
                    Then assign teachers under{" "}
                    <Link href="/dashboard/teaching-load" className="text-theme-accent underline">
                      Teaching load
                    </Link>
                    .
                  </p>
                </div>
                <LoadingButton loading={installing} onClick={() => void installSubjects()}>
                  Install default subjects
                </LoadingButton>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  className="ms-input sm:col-span-2"
                  placeholder="Subject name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="ms-input"
                  placeholder="Code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
                <LoadingButton loading={adding} onClick={() => void addSubject()}>
                  Add subject
                </LoadingButton>
                <select className="ms-input" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}>
                  {["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((l) => (
                    <option key={l} value={l}>
                      From {l}
                    </option>
                  ))}
                </select>
                <select className="ms-input" value={newTo} onChange={(e) => setNewTo(e.target.value)}>
                  {["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((l) => (
                    <option key={l} value={l}>
                      To {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase text-theme-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Code</th>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Levels</th>
                      <th className="px-2 py-1 text-left">Catalogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s) => (
                      <tr key={s.id} className="border-t border-theme">
                        <td className="px-2 py-2 font-mono text-xs">{s.code}</td>
                        <td className="px-2 py-2">{s.name}</td>
                        <td className="px-2 py-2 text-theme-muted">
                          {s.appliesFrom}–{s.appliesTo}
                        </td>
                        <td className="px-2 py-2 text-theme-muted">
                          {s.schoolSubjectId ? "Linked" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ThemesAndStrandsPanel />
            </div>
          </>
        ) : null}
      </div>
    </DashboardPage>
  );
}

function ThemesAndStrandsPanel() {
  const { toast } = useToast();
  const [themeName, setThemeName] = useState("");
  const [strandName, setStrandName] = useState("");
  const [busy, setBusy] = useState(false);

  const themesQ = useQuery({
    queryKey: ["primary", "themes", "setup"],
    queryFn: () => primaryApi.themes(undefined, true),
  });
  const strandsQ = useQuery({
    queryKey: ["primary", "strands", "setup"],
    queryFn: () => primaryApi.listStrands(true),
  });

  async function addTheme() {
    if (!themeName.trim()) return;
    setBusy(true);
    try {
      await primaryApi.createTheme({ name: themeName.trim() });
      setThemeName("");
      toast.success("Theme added.");
      await themesQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add theme.");
    } finally {
      setBusy(false);
    }
  }

  async function addStrand() {
    if (!strandName.trim()) return;
    setBusy(true);
    try {
      await primaryApi.createStrand({ name: strandName.trim() });
      setStrandName("");
      toast.success("Strand added.");
      await strandsQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add strand.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTheme(id: string, isActive: boolean) {
    try {
      await primaryApi.updateTheme(id, { isActive: !isActive });
      await themesQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function toggleStrand(id: string, isActive: boolean) {
    try {
      await primaryApi.updateStrand(id, { isActive: !isActive });
      await strandsQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
      <h2 className="font-semibold text-theme-primary">Themes & strands (P1–P3)</h2>
      <p className="text-sm text-theme-muted">
        Manage thematic catalogue used by lower-primary sittings. Deactivate instead of
        deleting when assessments already exist.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="ms-input flex-1"
              placeholder="New theme name"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
            />
            <LoadingButton loading={busy} onClick={() => void addTheme()}>
              Add
            </LoadingButton>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {(themesQ.data?.themes ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border border-theme px-2 py-1.5"
              >
                <span className={t.isActive === false ? "text-theme-muted line-through" : ""}>
                  {t.name}
                </span>
                <button
                  type="button"
                  className="text-xs text-theme-accent"
                  onClick={() => void toggleTheme(t.id, t.isActive !== false)}
                >
                  {t.isActive === false ? "Activate" : "Deactivate"}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="ms-input flex-1"
              placeholder="New strand name"
              value={strandName}
              onChange={(e) => setStrandName(e.target.value)}
            />
            <LoadingButton loading={busy} onClick={() => void addStrand()}>
              Add
            </LoadingButton>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {(strandsQ.data ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md border border-theme px-2 py-1.5"
              >
                <span className={!s.isActive ? "text-theme-muted line-through" : ""}>
                  {s.name}
                </span>
                <button
                  type="button"
                  className="text-xs text-theme-accent"
                  onClick={() => void toggleStrand(s.id, s.isActive)}
                >
                  {s.isActive ? "Deactivate" : "Activate"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
