"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import {
  OLEVEL_LEVEL_BANDS,
  schoolOffersOLevel,
  type CurriculumReportRules,
  type CurriculumSubject,
  type OLevelLevelBand,
  type OLevelSubject,
  type SelectionRule,
} from "@makyschool/shared";
import { olevelApi } from "@/lib/api/olevel";
import { roleForSubjectInBand } from "@/lib/olevel/registration";
import {
  useOLevelCurriculum,
  useOLevelCurriculumSubjects,
  useOLevelSubjects,
} from "@/hooks/useOLevel";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

const tabs = ["Grade scale", "Categories", "Selection rules", "Subjects", "Report rules"] as const;
type Tab = (typeof tabs)[number];

type BandRole = "compulsory" | "optional" | "co_curricular" | "";

const FIELD_LABELS: Record<string, string> = {
  grade: "Grade",
  label: "Label",
  minPercent: "Min %",
  maxPercent: "Max %",
  points: "Points",
  isPass: "Pass?",
  name: "Name",
  code: "Code",
  weightPercent: "Weight %",
  isActive: "Active",
  appliesToLevels: "Levels",
  minSubjects: "Min subjects",
  maxSubjects: "Max subjects",
  compulsoryCount: "Compulsory count",
  optionalMin: "Optional min",
  optionalMax: "Optional max",
  optionalToCountInResult: "Optionals in result",
};

export function OLevelSetupWizard() {
  const { school } = useSchool();
  const { toast } = useToast();
  const offers = schoolOffersOLevel(school?.school_type);
  const { data: curriculum, refetch } = useOLevelCurriculum(offers);
  const { data: subjects = [] } = useOLevelSubjects(offers);
  const { data: assigned = [], refetch: refetchAssigned } = useOLevelCurriculumSubjects(
    curriculum?.id,
    offers,
  );

  const [tab, setTab] = useState<Tab>("Grade scale");
  const [saving, setSaving] = useState(false);
  const [grades, setGrades] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<Record<string, unknown>[]>([]);
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [report, setReport] = useState<Partial<CurriculumReportRules>>({});
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!curriculum) return;
    setGrades((curriculum.gradeScale ?? []) as Record<string, unknown>[]);
    setCategories((curriculum.assessmentCategories ?? []) as Record<string, unknown>[]);
    setRules((curriculum.selectionRules ?? []) as Record<string, unknown>[]);
    setReport(curriculum.reportRules ?? {});
    setDirty(false);
  }, [curriculum]);

  if (!offers) {
    return (
      <DashboardPage embedded title="O-Level setup">
        <EmptyState title="O-Level not enabled" description="Not available for this school type." />
      </DashboardPage>
    );
  }
  if (!curriculum) {
    return (
      <DashboardPage embedded title="O-Level setup">
        <EmptyState
          title="Set up O-Level first"
          description="Create the curriculum from the O-Level overview before editing its rules."
        />
      </DashboardPage>
    );
  }

  function markDirty(
    items: Record<string, unknown>[],
    set: (v: Record<string, unknown>[]) => void,
    i: number,
    key: string,
    value: string | boolean,
  ) {
    set(
      items.map((x, n) =>
        n === i
          ? {
              ...x,
              [key]:
                typeof x[key] === "number"
                  ? Number(value)
                  : key === "appliesToLevels" && typeof value === "string"
                    ? value.split(",").map((s) => s.trim()).filter(Boolean)
                    : value,
            }
          : x,
      ),
    );
    setDirty(true);
    setBanner(null);
  }

  function validateBeforeSave(): string | null {
    if (tab === "Categories") {
      const total = categories.reduce(
        (sum, c) => sum + (Number(c.weightPercent) || 0),
        0,
      );
      if (Math.abs(total - 100) > 0.01) {
        return `Assessment category weights must total 100% (currently ${total}%).`;
      }
    }
    if (tab === "Selection rules") {
      for (const rule of rules as unknown as SelectionRule[]) {
        const levels = Array.isArray(rule.appliesToLevels)
          ? rule.appliesToLevels.join(", ")
          : String(rule.appliesToLevels ?? "");
        if (rule.optionalMin > rule.optionalMax) {
          return `${levels}: optional min cannot exceed optional max.`;
        }
        if (rule.compulsoryCount + rule.optionalMin > rule.maxSubjects) {
          return `${levels}: compulsory + optional min exceeds max subjects.`;
        }
      }
    }
    return null;
  }

  async function save() {
    if (!curriculum) return;
    const validation = validateBeforeSave();
    if (validation) {
      setBanner({ tone: "error", message: validation });
      toast.error(validation);
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      if (tab === "Grade scale") await olevelApi.putGradeScale(curriculum.id, grades);
      if (tab === "Categories") await olevelApi.putCategories(curriculum.id, categories);
      if (tab === "Selection rules") await olevelApi.putSelectionRules(curriculum.id, rules);
      if (tab === "Report rules") await olevelApi.putReportRules(curriculum.id, report);
      await refetch();
      setDirty(false);
      const message = `${tab} saved successfully.`;
      toast.success(message);
      setBanner({ tone: "success", message });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save changes.";
      toast.error(message);
      setBanner({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Curriculum setup"
      description="Configure grade scale, assessment weights, selection rules, and which subjects are compulsory or optional for S1–S2 and S3–S4."
    >
      <div className="space-y-5">
        {banner ? (
          <StatusBanner
            tone={banner.tone}
            message={banner.message}
            onDismiss={() => setBanner(null)}
            autoDismissMs={banner.tone === "success" ? 4000 : undefined}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (dirty && t !== tab) {
                  setBanner({
                    tone: "info",
                    message: "You have unsaved changes on this tab. Save before switching, or continue to discard them after reload.",
                  });
                }
                setTab(t);
              }}
              className={`rounded-lg px-3 py-2 text-sm ${
                tab === t ? "bg-theme-accent text-white" : "bg-theme-raised text-theme-muted"
              }`}
            >
              {t}
              {dirty && tab === t ? " •" : ""}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-theme bg-theme-surface p-5">
          {tab === "Grade scale" && (
            <>
              <p className="mb-3 text-sm text-theme-muted">
                Grade letters, percentage bands, and points used on report cards.
              </p>
              <EditableTable
                rows={grades}
                fields={["grade", "label", "minPercent", "maxPercent", "points", "isPass"]}
                change={(i, k, v) => markDirty(grades, setGrades, i, k, v)}
              />
            </>
          )}

          {tab === "Categories" && (
            <>
              <p className="mb-3 text-sm text-theme-muted">
                Assessment categories and weights. Weights must total 100%.
              </p>
              <EditableTable
                rows={categories}
                fields={["name", "code", "weightPercent", "isActive"]}
                change={(i, k, v) => markDirty(categories, setCategories, i, k, v)}
              />
            </>
          )}

          {tab === "Selection rules" && (
            <>
              <p className="mb-3 text-sm text-theme-muted">
                How many compulsory and optional subjects each student must take. Configure one rule for
                S1–S2 and another for S3–S4.
              </p>
              <EditableTable
                rows={rules}
                fields={[
                  "appliesToLevels",
                  "minSubjects",
                  "maxSubjects",
                  "compulsoryCount",
                  "optionalMin",
                  "optionalMax",
                  "optionalToCountInResult",
                ]}
                change={(i, k, v) => markDirty(rules, setRules, i, k, v)}
              />
            </>
          )}

          {tab === "Subjects" && (
            <SubjectsBandEditor
              curriculumId={curriculum.id}
              catalogue={subjects}
              assigned={assigned}
              rules={curriculum.selectionRules ?? []}
              onSaved={async (message) => {
                await refetchAssigned();
                await refetch();
                toast.success(message);
                setBanner({ tone: "success", message });
              }}
              onError={(message) => {
                toast.error(message);
                setBanner({ tone: "error", message });
              }}
            />
          )}

          {tab === "Report rules" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  "showGrades",
                  "showPercentages",
                  "showPoints",
                  "showRemarks",
                  "showClassPosition",
                  "showSubjectPosition",
                  "showDivisionRanking",
                  "showResultCode",
                  "showTeacherComment",
                  "showHeadTeacherComment",
                  "showAttendance",
                ] as const
              ).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-theme-primary">
                  <input
                    type="checkbox"
                    checked={Boolean(report[key])}
                    onChange={(e) => {
                      setReport({ ...report, [key]: e.target.checked });
                      setDirty(true);
                      setBanner(null);
                    }}
                  />
                  {key.replace(/^show/, "Show ")}
                </label>
              ))}
              <label className="sm:col-span-2 text-sm">
                Report title
                <input
                  className="ms-input mt-1 w-full"
                  value={report.reportTitle ?? ""}
                  onChange={(e) => {
                    setReport({ ...report, reportTitle: e.target.value });
                    setDirty(true);
                    setBanner(null);
                  }}
                />
              </label>
            </div>
          )}

          {tab !== "Subjects" && (
            <LoadingButton className="mt-5" loading={saving} onClick={() => void save()}>
              Save {tab}
            </LoadingButton>
          )}
        </div>
      </div>
    </DashboardPage>
  );
}

function SubjectsBandEditor({
  curriculumId,
  catalogue,
  assigned,
  rules,
  onSaved,
  onError,
}: {
  curriculumId: string;
  catalogue: OLevelSubject[];
  assigned: CurriculumSubject[];
  rules: SelectionRule[];
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [band, setBand] = useState<OLevelLevelBand>("S1-S2");
  const [roles, setRoles] = useState<Record<string, BandRole>>({});
  const [saving, setSaving] = useState(false);

  const levels = OLEVEL_LEVEL_BANDS[band].levels;

  useEffect(() => {
    const next: Record<string, BandRole> = {};
    for (const s of catalogue) {
      next[s.id] = roleForSubjectInBand(assigned, s.id, band);
    }
    setRoles(next);
  }, [catalogue, assigned, band]);

  const counts = useMemo(() => {
    const values = Object.values(roles);
    return {
      compulsory: values.filter((r) => r === "compulsory").length,
      optional: values.filter((r) => r === "optional").length,
      none: values.filter((r) => !r).length,
    };
  }, [roles]);

  const rule = rules.find((r) => levels.every((lv) => r.appliesToLevels.includes(lv)));

  async function saveBand() {
    if (rule && counts.compulsory !== rule.compulsoryCount) {
      onError(
        `${OLEVEL_LEVEL_BANDS[band].label}: mark exactly ${rule.compulsoryCount} compulsory subjects (currently ${counts.compulsory}).`,
      );
      return;
    }
    setSaving(true);
    try {
      const subjects = Object.entries(roles)
        .filter(([, role]) => role)
        .map(([subjectId, subjectRole]) => ({
          subjectId,
          subjectRole: subjectRole as string,
        }));
      await olevelApi.replaceBandSubjects(curriculumId, {
        appliesToLevels: levels,
        subjects,
      });
      await onSaved(
        `${OLEVEL_LEVEL_BANDS[band].label}: saved ${counts.compulsory} compulsory and ${counts.optional} optional subjects.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save subjects.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-theme-muted">
          Choose which catalogue subjects are compulsory or optional for each level band. Students then
          pick from the optionals when registering.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(OLEVEL_LEVEL_BANDS) as OLevelLevelBand[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBand(key)}
              className={`rounded-lg px-3 py-2 text-sm ${
                band === key ? "bg-theme-accent text-white" : "bg-theme-raised text-theme-muted"
              }`}
            >
              {OLEVEL_LEVEL_BANDS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-theme-raised/60 px-3 py-2 text-sm text-theme-muted">
        {rule ? (
          <>
            Rule expects <strong className="text-theme-primary">{rule.compulsoryCount} compulsory</strong>{" "}
            and{" "}
            <strong className="text-theme-primary">
              {rule.optionalMin}–{rule.optionalMax} optional
            </strong>
            . Current selection: {counts.compulsory} compulsory · {counts.optional} optional ·{" "}
            {counts.none} not offered.
          </>
        ) : (
          <>No selection rule found for {levels.join("–")}. Add one under Selection rules.</>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-theme-muted">
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Role for {levels.join("–")}</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map((s) => (
              <tr key={s.id} className="border-t border-theme">
                <td className="p-2 font-medium text-theme-primary">{s.name}</td>
                <td className="p-2 text-theme-muted">{s.code}</td>
                <td className="p-2">
                  <select
                    className="ms-input min-w-40"
                    value={roles[s.id] ?? ""}
                    onChange={(e) =>
                      setRoles((prev) => ({
                        ...prev,
                        [s.id]: e.target.value as BandRole,
                      }))
                    }
                  >
                    <option value="">Not offered</option>
                    <option value="compulsory">Compulsory</option>
                    <option value="optional">Optional</option>
                    <option value="co_curricular">Co-curricular</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!catalogue.length ? (
          <p className="py-6 text-center text-sm text-theme-muted">
            No subjects in the O-Level catalogue yet.
          </p>
        ) : null}
      </div>

      <LoadingButton loading={saving} onClick={() => void saveBand()}>
        Save {OLEVEL_LEVEL_BANDS[band].label} subjects
      </LoadingButton>
    </div>
  );
}

function EditableTable({
  rows,
  fields,
  change,
}: {
  rows: Record<string, unknown>[];
  fields: string[];
  change: (i: number, k: string, v: string | boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f} className="px-2 py-2 text-left text-xs text-theme-muted">
                {FIELD_LABELS[f] ?? f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="border-t border-theme">
              {fields.map((f) => (
                <td key={f} className="p-2">
                  {typeof row[f] === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(row[f])}
                      onChange={(e) => change(i, f, e.target.checked)}
                    />
                  ) : (
                    <input
                      className="ms-input min-w-20"
                      value={
                        Array.isArray(row[f])
                          ? (row[f] as string[]).join(", ")
                          : String(row[f] ?? "")
                      }
                      onChange={(e) => change(i, f, e.target.value)}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-theme-muted">No rules configured yet.</p>
      ) : null}
    </div>
  );
}
