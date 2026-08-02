"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { PAGE_SIZE_OPTIONS } from "@makyschool/shared/constants";
import type {
  CurriculumSubject,
  SelectionRule,
  StudentCurriculumEnrollment,
} from "@makyschool/shared";
import { olevelApi } from "@/lib/api/olevel";
import {
  buildRegistrationPayload,
  defaultClassAndYear,
  describeSelectionRule,
  registrationStatus,
  selectionRuleForLevel,
  subjectsForLevel,
  validateOptionalSelection,
} from "@/lib/olevel/registration";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  useOLevelClasses,
  useOLevelCurriculum,
  useOLevelCurriculumSubjects,
  useOLevelEnrollments,
  useOLevelTerms,
} from "@/hooks/useOLevel";
import { useToast } from "@/providers/ToastProvider";


export function OLevelStudentsContent() {
  const { toast } = useToast();
  const { data: classes = [] } = useOLevelClasses();
  const { data: terms = [] } = useOLevelTerms();
  const { data: curriculum } = useOLevelCurriculum();
  const defaults = useMemo(() => defaultClassAndYear(classes, terms), [classes, terms]);

  const [classId, setClassId] = useState("");
  const [yearId, setYearId] = useState("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [optionalPick, setOptionalPick] = useState<string[]>([]);
  const [busy, setBusy] = useState<"enroll" | "bulk" | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (defaultsApplied) return;
    if (!defaults.classId && !defaults.yearId) return;
    setClassId(defaults.classId);
    setYearId(defaults.yearId);
    setDefaultsApplied(true);
  }, [defaults, defaultsApplied]);

  const years = useMemo(
    () => Array.from(new Map(terms.map((t) => [t.academicYearId, t.academicYearName])).entries()),
    [terms],
  );

  const selectedClass = classes.find((c) => c.id === classId);
  const level = selectedClass?.level ?? "";
  const rule = selectionRuleForLevel(curriculum?.selectionRules, level);

  const { data: enrollments = [], refetch, isFetching } = useOLevelEnrollments(
    classId || undefined,
    yearId || undefined,
  );
  const { data: subjects = [] } = useOLevelCurriculumSubjects(curriculum?.id);

  const compulsory = useMemo(
    () => (level ? subjectsForLevel(subjects, level, "compulsory") : []),
    [subjects, level],
  );
  const optional = useMemo(
    () => (level ? subjectsForLevel(subjects, level, "optional") : []),
    [subjects, level],
  );

  useEffect(() => {
    setCheckedIds([]);
    setSelectedEnrollmentId("");
    setOptionalPick([]);
    setBanner(null);
  }, [classId, yearId]);

  const completeCount = enrollments.filter(
    (e) => registrationStatus(e, rule) === "complete",
  ).length;
  const incomplete = enrollments.filter((e) => registrationStatus(e, rule) !== "complete");

  const { paged, page, setPage, pageSize, setPageSize, total } = useClientPagination({
    items: enrollments,
    resetDeps: [classId, yearId],
  });

  function toggleCheck(id: string) {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleOptional(id: string) {
    setOptionalPick((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const max = rule?.optionalMax ?? 1;
      if (prev.length >= max) {
        return max === 1 ? [id] : prev;
      }
      return [...prev, id];
    });
  }

  async function bulkEnroll() {
    if (!classId || !yearId || !curriculum) {
      return toast.error("Select a class and academic year.");
    }
    setBusy("enroll");
    setBanner(null);
    try {
      const r = await olevelApi.bulkEnroll({
        classId,
        academicYearId: yearId,
        curriculumId: curriculum.id,
      });
      const message = `${r.enrolled} students enrolled (${r.skipped} already enrolled).`;
      toast.success(message);
      setBanner({ tone: "success", message });
      void refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Enrollment failed.";
      toast.error(message);
      setBanner({ tone: "error", message });
    } finally {
      setBusy(null);
    }
  }

  async function applyOptionalPackage(targetIds: string[]) {
    if (!classId || !yearId || !level) {
      return toast.error("Select a class and academic year.");
    }
    if (!targetIds.length) {
      return toast.error("Select at least one student.");
    }
    const error = validateOptionalSelection(rule, compulsory.length, optionalPick.length);
    if (error) {
      setBanner({ tone: "error", message: error });
      return toast.error(error);
    }
    setBusy("bulk");
    setBanner(null);
    try {
      const payload = buildRegistrationPayload(subjects, level, optionalPick);
      const r = await olevelApi.bulkRegisterSubjects({
        classId,
        academicYearId: yearId,
        subjects: payload,
        enrollmentIds: targetIds,
      });
      const names = optional
        .filter((s) => optionalPick.includes(s.subjectId))
        .map((s) => s.name)
        .join(", ");
      const message = `Applied ${names || "optional package"} to ${r.enrolled} student(s).`;
      toast.success(message);
      setBanner({ tone: "success", message });
      setCheckedIds([]);
      void refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not register subjects.";
      toast.error(message);
      setBanner({ tone: "error", message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="Students and subject registration"
      description="Enroll the class, then assign the same optional subjects to groups of students. Compulsory subjects come from the curriculum for this level."
    >
      <div className="space-y-5">
        {banner ? (
          <StatusBanner
            tone={banner.tone}
            message={banner.message}
            onDismiss={() => setBanner(null)}
            autoDismissMs={banner.tone === "success" ? 5000 : undefined}
          />
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-theme bg-theme-surface p-4">
          <label className="text-sm text-theme-muted">
            Class
            <select
              className="ms-input mt-1 block min-w-40"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Choose class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-theme-muted">
            Academic year
            <select
              className="ms-input mt-1 block min-w-40"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
            >
              <option value="">Choose year</option>
              {years.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <LoadingButton loading={busy === "enroll"} onClick={() => void bulkEnroll()}>
            Bulk enroll class
          </LoadingButton>
        </div>

        {classId && yearId ? (
          <div className="rounded-xl border border-theme bg-theme-surface p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-theme-primary">Subject package for {selectedClass?.name}</h2>
                <p className="mt-1 text-sm text-theme-muted">{describeSelectionRule(rule)}</p>
              </div>
              <p className="text-sm text-theme-muted">
                {completeCount}/{enrollments.length} fully registered
                {isFetching ? " · refreshing…" : ""}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                Compulsory ({compulsory.length}) — set in curriculum setup
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {compulsory.length ? (
                  compulsory.map((s) => (
                    <span
                      key={s.subjectId}
                      className="rounded-md bg-theme-raised px-2.5 py-1 text-sm text-theme-primary"
                    >
                      {s.name}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-theme-muted">
                    No compulsory subjects for this level. Configure them under Curriculum setup → Subjects.
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                Optional package ({optionalPick.length}
                {rule ? ` / ${rule.optionalMin}–${rule.optionalMax}` : ""})
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {optional.map((s) => (
                  <label
                    key={s.subjectId}
                    className="flex items-center gap-2 rounded-lg border border-theme px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={optionalPick.includes(s.subjectId)}
                      onChange={() => toggleOptional(s.subjectId)}
                    />
                    <span>
                      {s.name}{" "}
                      <span className="text-theme-muted">({s.code})</span>
                    </span>
                  </label>
                ))}
                {!optional.length ? (
                  <p className="text-sm text-theme-muted sm:col-span-2">
                    No optional subjects for this level yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <LoadingButton
                loading={busy === "bulk"}
                disabled={!checkedIds.length}
                onClick={() => void applyOptionalPackage(checkedIds)}
              >
                Apply to selected ({checkedIds.length})
              </LoadingButton>
              <LoadingButton
                variant="ghost"
                loading={busy === "bulk"}
                disabled={!incomplete.length}
                onClick={() => void applyOptionalPackage(incomplete.map((e) => e.id))}
              >
                Apply to incomplete ({incomplete.length})
              </LoadingButton>
              <button
                type="button"
                className="rounded-lg bg-theme-raised px-3 py-2 text-sm"
                onClick={() => setCheckedIds(enrollments.map((e) => e.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded-lg bg-theme-raised px-3 py-2 text-sm"
                onClick={() => setCheckedIds([])}
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-theme-muted">
              <tr>
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    aria-label="Select students on this page"
                    checked={
                      paged.length > 0 && paged.every((x) => checkedIds.includes(x.id))
                    }
                    onChange={(e) => {
                      const pageIds = paged.map((x) => x.id);
                      setCheckedIds((prev) =>
                        e.target.checked
                          ? Array.from(new Set([...prev, ...pageIds]))
                          : prev.filter((id) => !pageIds.includes(id)),
                      );
                    }}
                  />
                </th>
                <th className="p-3 text-left">Student</th>
                <th className="text-left">Student ID</th>
                <th className="text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!enrollments.length ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-theme-muted">
                    {classId && yearId
                      ? "No enrollments yet. Use “Bulk enroll class” to add students from this class."
                      : "Choose a class and academic year to begin."}
                  </td>
                </tr>
              ) : (
                paged.map((e) => (
                  <EnrollmentRow
                    key={e.id}
                    enrollment={e}
                    rule={rule}
                    checked={checkedIds.includes(e.id)}
                    onCheck={() => toggleCheck(e.id)}
                    onEdit={() => setSelectedEnrollmentId(e.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          noun="students"
        />

        {selectedEnrollmentId ? (
          <RegistrationPanel
            enrollmentId={selectedEnrollmentId}
            subjects={subjects}
            level={level}
            rule={rule}
            compulsory={compulsory}
            optional={optional}
            onClose={() => setSelectedEnrollmentId("")}
            onSaved={() => {
              setSelectedEnrollmentId("");
              toast.success("Subject registration saved.");
              setBanner({ tone: "success", message: "Subject registration saved." });
              void refetch();
            }}
          />
        ) : null}
      </div>
    </DashboardPage>
  );
}

function EnrollmentRow({
  enrollment,
  rule,
  checked,
  onCheck,
  onEdit,
}: {
  enrollment: StudentCurriculumEnrollment;
  rule?: SelectionRule;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
}) {
  const status = registrationStatus(enrollment, rule);
  const label =
    status === "complete"
      ? "Complete"
      : status === "partial"
        ? `Partial (${enrollment.registeredSubjectCount ?? 0})`
        : "Not registered";
  const tone =
    status === "complete"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "partial"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
        : "bg-theme-raised text-theme-muted";

  return (
    <tr className="border-t border-theme">
      <td className="p-3">
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${enrollment.studentName}`} />
      </td>
      <td className="p-3 font-medium text-theme-primary">{enrollment.studentName}</td>
      <td>{enrollment.learnerId ?? "—"}</td>
      <td>
        <span className={`rounded-full px-2.5 py-1 text-xs ${tone}`}>{label}</span>
      </td>
      <td className="p-3 text-right">
        <button type="button" className="text-theme-accent" onClick={onEdit}>
          Edit
        </button>
      </td>
    </tr>
  );
}

function RegistrationPanel({
  enrollmentId,
  subjects,
  level,
  rule,
  compulsory,
  optional,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  subjects: CurriculumSubject[];
  level: string;
  rule?: SelectionRule;
  compulsory: CurriculumSubject[];
  optional: CurriculumSubject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const regs = await olevelApi.listEnrollmentSubjects(enrollmentId);
        if (cancelled) return;
        setChosen(
          regs
            .filter((r) => r.status === "active" && r.subjectRole === "optional")
            .map((r) => r.subjectId),
        );
      } catch {
        if (!cancelled) setChosen([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrollmentId]);

  function toggle(id: string) {
    setChosen((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      const max = rule?.optionalMax ?? 1;
      if (prev.length >= max) return max === 1 ? [id] : prev;
      return [...prev, id];
    });
    setError(null);
  }

  async function save() {
    const validation = validateOptionalSelection(rule, compulsory.length, chosen.length);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await olevelApi.registerSubjects(
        enrollmentId,
        buildRegistrationPayload(subjects, level, chosen),
      );
      onSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-theme bg-theme-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-theme-primary">Edit student optionals</h2>
          <p className="mt-1 text-sm text-theme-muted">{describeSelectionRule(rule)}</p>
        </div>
        <button type="button" className="text-sm text-theme-muted" onClick={onClose}>
          Close
        </button>
      </div>

      {error ? <StatusBanner tone="error" message={error} /> : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
          Compulsory (auto-included)
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {compulsory.map((s) => (
            <span key={s.subjectId} className="rounded-md bg-theme-raised px-2.5 py-1 text-sm">
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
          Optional ({chosen.length}
          {rule ? ` / ${rule.optionalMin}–${rule.optionalMax}` : ""})
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {optional.map((s) => (
            <label key={s.subjectId} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(s.subjectId)}
                onChange={() => toggle(s.subjectId)}
                disabled={!loaded}
              />
              {s.name} ({s.code})
            </label>
          ))}
        </div>
      </div>

      <LoadingButton loading={saving || !loaded} onClick={() => void save()}>
        Save registration
      </LoadingButton>
    </div>
  );
}
