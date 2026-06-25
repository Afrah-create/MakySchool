"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatClassLabel } from "@makyschool/shared/constants";
import type {
  ClassWithDetails,
  SchoolPeriodTemplate,
  SubjectWithDetails,
  TimetableGrid,
  TimetablePeriod,
  TimetablePeriodInput,
} from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { CanDo } from "@/components/ui/CanDo";
import { SchoolPeriodTemplateEditor } from "@/components/timetable/SchoolPeriodTemplateEditor";
import { TimetablePeriodForm } from "@/components/timetable/TimetablePeriodForm";
import { apiClient } from "@/lib/api/client";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import type { TeachersListResponse } from "@/lib/teachers/types";
import {
  applyTemplateTimes,
  validateTimetableDraft,
} from "@/lib/timetable/validation";
import {
  TIMETABLE_DAYS,
  TRACK_TONE,
  mapToPayload,
  normalizeClassIds,
  normalizeTeachers,
  periodToInput,
  resolvePeriodCount,
  slotKey,
  teacherInitials,
} from "@/lib/timetable/utils";

type ActiveSlot = {
  dayOfWeek: number;
  dayLabel: string;
  periodNumber: number;
};

export function TimetableEditor() {
  const { data: classes, error: classesError, isLoading: loadingClasses, mutate: mutateClasses } =
    useSchoolSWR<ClassWithDetails[]>("/schools/classes");
  const { data: subjects, error: subjectsError, isLoading: loadingSubjects, mutate: mutateSubjects } =
    useSchoolSWR<SubjectWithDetails[]>("/schools/subjects");
  const { data: teachersData, error: teachersError, isLoading: loadingTeachers, mutate: mutateTeachers } =
    useSchoolSWR<TeachersListResponse>("/schools/teachers?limit=100");
  const {
    data: periodTemplates,
    error: templatesError,
    isLoading: loadingTemplates,
    mutate: mutateTemplates,
  } = useSchoolSWR<SchoolPeriodTemplate[]>("/schools/timetable/period-templates");

  const [selectedClassId, setSelectedClassId] = useState("");
  const [draft, setDraft] = useState<Map<string, TimetablePeriodInput>>(new Map());
  const [termId, setTermId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkClassIds, setBulkClassIds] = useState<string[]>([]);
  const [showBulkCopy, setShowBulkCopy] = useState(false);

  const gridPath =
    selectedClassId ? `/schools/timetable/class/${selectedClassId}` : null;
  const {
    data: grid,
    error: gridError,
    isLoading: loadingGrid,
    mutate: mutateGrid,
  } = useSchoolSWR<TimetableGrid>(gridPath);

  const allTimetablePath = termId ? `/schools/timetable?termId=${termId}` : "/schools/timetable";
  const {
    data: allSchoolPeriods,
    mutate: mutateAllSchoolPeriods,
  } = useSchoolSWR<TimetablePeriod[]>(allTimetablePath);

  useEffect(() => {
    if (!selectedClassId && classes?.length) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!grid) return;
    setTermId(grid.termId);
    const next = new Map<string, TimetablePeriodInput>();
    for (const period of grid.periods) {
      next.set(slotKey(period.day_of_week, period.period_number), periodToInput(period));
    }
    setDraft(next);
    setSaveError(null);
  }, [grid]);

  const templates = periodTemplates ?? [];
  const templateMap = useMemo(
    () => new Map(templates.map((item) => [item.periodNumber, item])),
    [templates],
  );

  const periodCount = useMemo(
    () => resolvePeriodCount(grid?.periods ?? [], templates.length),
    [grid?.periods, templates.length],
  );

  const selectedClass = classes?.find((item) => item.id === selectedClassId);
  const teachers = useMemo(
    () => normalizeTeachers(teachersData?.teachers ?? []),
    [teachersData?.teachers],
  );

  const classSubjects = useMemo(() => {
    if (!subjects || !selectedClassId) return [];
    return subjects.filter((subject) =>
      normalizeClassIds(subject.class_ids).includes(selectedClassId),
    );
  }, [selectedClassId, subjects]);

  const linkedSubjectIds = useMemo(
    () => new Set(classSubjects.map((subject) => subject.id)),
    [classSubjects],
  );

  const normalizedDraft = useMemo(
    () => applyTemplateTimes(draft, templates),
    [draft, templates],
  );

  const validation = useMemo(() => {
    if (!selectedClassId || draft.size === 0) {
      return { valid: templates.length > 0, globalErrors: [], slotErrors: new Map<string, string[]>() };
    }
    return validateTimetableDraft(normalizedDraft, {
      classId: selectedClassId,
      linkedSubjectIds,
      teachers,
      templates,
      otherClassPeriods: allSchoolPeriods ?? [],
    });
  }, [
    allSchoolPeriods,
    draft.size,
    linkedSubjectIds,
    normalizedDraft,
    selectedClassId,
    teachers,
    templates,
  ]);

  const conflictKeys = useMemo(() => new Set(validation.slotErrors.keys()), [validation.slotErrors]);

  const updateDraft = useCallback((updater: (current: Map<string, TimetablePeriodInput>) => Map<string, TimetablePeriodInput>) => {
    setDraft((current) => applyTemplateTimes(updater(current), templates));
    setSaveError(null);
  }, [templates]);

  const handleSave = useCallback(async () => {
    if (!selectedClassId || !validation.valid) return;
    const payload = mapToPayload(normalizedDraft);
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient<TimetableGrid>("/schools/timetable", {
        method: "POST",
        body: {
          classId: selectedClassId,
          termId,
          periods: payload,
        },
      });
      await Promise.all([mutateGrid(), mutateAllSchoolPeriods()]);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [mutateAllSchoolPeriods, mutateGrid, normalizedDraft, selectedClassId, termId, validation.valid]);

  const handleBulkCopy = useCallback(async () => {
    if (!validation.valid || bulkClassIds.length === 0) return;
    const payload = mapToPayload(normalizedDraft);
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient<TimetableGrid[]>("/schools/timetable/bulk", {
        method: "POST",
        body: {
          termId,
          classes: bulkClassIds.map((classId) => ({
            classId,
            periods: payload,
          })),
        },
      });
      setShowBulkCopy(false);
      setBulkClassIds([]);
      await Promise.all([mutateGrid(), mutateAllSchoolPeriods()]);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [bulkClassIds, mutateAllSchoolPeriods, mutateGrid, normalizedDraft, termId, validation.valid]);

  const clearPeriodRow = (periodNumber: number) => {
    updateDraft((current) => {
      const next = new Map(current);
      for (const day of TIMETABLE_DAYS) {
        next.delete(slotKey(day.value, periodNumber));
      }
      return next;
    });
  };

  const copyMondayToAllDays = (periodNumber: number) => {
    const monday = normalizedDraft.get(slotKey(1, periodNumber));
    if (!monday) return;
    updateDraft((current) => {
      const next = new Map(current);
      for (const day of TIMETABLE_DAYS) {
        next.set(slotKey(day.value, periodNumber), {
          ...monday,
          dayOfWeek: day.value,
        });
      }
      return next;
    });
  };

  const isLoading =
    (loadingClasses && !classes) ||
    (loadingSubjects && !subjects) ||
    (loadingTeachers && !teachersData) ||
    (loadingTemplates && !periodTemplates) ||
    (loadingGrid && !grid && !!selectedClassId);

  const error = classesError ?? subjectsError ?? teachersError ?? gridError ?? templatesError;

  const retry = () => {
    void mutateClasses();
    void mutateSubjects();
    void mutateTeachers();
    void mutateTemplates();
    void mutateGrid();
    void mutateAllSchoolPeriods();
  };

  const canSave = Boolean(selectedClassId && templates.length > 0 && validation.valid);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary">Timetable</h1>
          <p className="mt-1 text-sm text-theme-muted">
            Define school periods once, then build class schedules with live validation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedClassId ? (
            <Link
              href={`/dashboard/timetable/print/${selectedClassId}`}
              className="ms-btn-ghost"
              target="_blank"
            >
              Print
            </Link>
          ) : null}
          <CanDo action="manageTimetable">
            <LoadingButton
              variant="ghost"
              disabled={!canSave || draft.size === 0}
              onClick={() => setShowBulkCopy((value) => !value)}
            >
              Copy to classes
            </LoadingButton>
            <LoadingButton
              loading={saving}
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              Save Timetable
            </LoadingButton>
          </CanDo>
        </div>
      </div>

      <CanDo action="manageTimetable">
        <SchoolPeriodTemplateEditor
          templates={templates}
          onSaved={() => {
            void mutateTemplates();
            updateDraft((current) => current);
          }}
        />
      </CanDo>

      <div className="ms-card p-4 sm:p-5">
        <label className="block max-w-md space-y-1">
          <span className="text-xs font-medium text-theme-muted">Class</span>
          <select
            className="ms-input w-full"
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
          >
            <option value="">Select class</option>
            {(classes ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {formatClassLabel(item.level, item.stream)}
              </option>
            ))}
          </select>
        </label>
        {selectedClass ? (
          <p className="mt-2 text-xs text-theme-muted">
            Current term timetable{termId ? ` · term ${termId.slice(0, 8)}…` : ""}
          </p>
        ) : null}
      </div>

      {validation.globalErrors.length > 0 ? (
        <div className="badge-danger rounded-xl px-4 py-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {validation.globalErrors.map((message, index) => (
              <li key={`global-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveError ? (
        <div className="badge-danger rounded-xl px-4 py-3 text-sm">
          {saveError}
        </div>
      ) : null}

      {showBulkCopy ? (
        <div className="ms-card space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-theme-primary">Copy this timetable to other classes</h2>
            <p className="mt-1 text-xs text-theme-muted">
              Applies the current draft to selected classes for the same term.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(classes ?? [])
              .filter((item) => item.id !== selectedClassId)
              .map((item) => {
                const checked = bulkClassIds.includes(item.id);
                return (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setBulkClassIds((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        );
                      }}
                    />
                    {formatClassLabel(item.level, item.stream)}
                  </label>
                );
              })}
          </div>
          <div className="flex gap-2">
            <LoadingButton
              loading={saving}
              disabled={!canSave || bulkClassIds.length === 0}
              onClick={() => void handleBulkCopy()}
            >
              Apply to selected classes
            </LoadingButton>
            <button type="button" className="ms-btn-ghost" onClick={() => setShowBulkCopy(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {selectedClassId && templates.length > 0 && !isLoading ? (
        <>
          {draft.size === 0 ? (
            <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3 text-sm text-theme-muted">
              No timetable set for this class yet — start by adding a period in the grid below.
            </div>
          ) : !validation.valid ? (
            <div className="rounded-xl border border-theme-danger/30 bg-theme-danger/5 px-4 py-3 text-sm text-theme-danger">
              Fix highlighted slots before saving. Validation runs automatically as you edit.
            </div>
          ) : (
            <div className="rounded-xl border border-theme-success/30 bg-theme-success/5 px-4 py-3 text-sm text-theme-success">
              Timetable is valid and ready to save.
            </div>
          )}

          <div className="relative overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-2">
            <thead>
              <tr>
                <th className="w-28 px-2 py-2 text-left text-xs font-medium text-theme-muted">
                  Period
                </th>
                {TIMETABLE_DAYS.map((day) => (
                  <th
                    key={day.value}
                    className="px-2 py-2 text-left text-xs font-medium text-theme-muted"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periodCount }, (_, index) => index + 1).map((periodNumber) => {
                const template = templateMap.get(periodNumber) ?? null;
                return (
                <tr key={periodNumber}>
                  <td className="px-2 py-2 align-top">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-theme-muted">P{periodNumber}</p>
                      {template ? (
                        <p className="text-[10px] text-theme-muted">
                          {template.startTime}–{template.endTime}
                        </p>
                      ) : null}
                      <CanDo action="manageTimetable">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-left text-[10px] text-theme-accent hover:underline"
                            onClick={() => copyMondayToAllDays(periodNumber)}
                          >
                            Copy Mon → all
                          </button>
                          <button
                            type="button"
                            className="text-left text-[10px] text-theme-muted hover:text-theme-danger"
                            onClick={() => clearPeriodRow(periodNumber)}
                          >
                            Clear row
                          </button>
                        </div>
                      </CanDo>
                    </div>
                  </td>
                  {TIMETABLE_DAYS.map((day) => {
                    const key = slotKey(day.value, periodNumber);
                    const period = normalizedDraft.get(key);
                    const isConflict = conflictKeys.has(key);
                    const isActive =
                      activeSlot?.dayOfWeek === day.value &&
                      activeSlot.periodNumber === periodNumber;

                    return (
                      <td key={key} className="align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveSlot({
                              dayOfWeek: day.value,
                              dayLabel: day.label,
                              periodNumber,
                            })
                          }
                          className={`ms-card min-h-24 w-36 rounded-xl p-3 text-left transition hover:border-accent-soft ${
                            isConflict ? "badge-danger border" : ""
                          } ${period && !isConflict ? TRACK_TONE[period.track] : "bg-theme-surface"}`}
                        >
                          {period ? (
                            <>
                              <p className="text-xs font-semibold">
                                {classSubjects.find((s) => s.id === period.subjectId)?.name ??
                                  "Subject"}
                              </p>
                              <p className="mt-1 text-[11px] opacity-80">
                                {teacherInitials(
                                  teachers.find((t) => t.id === period.teacherId)?.full_name ??
                                    "T",
                                )}{" "}
                                · {period.startTime}–{period.endTime}
                              </p>
                              {isConflict ? (
                                <p className="mt-1 text-[10px] font-medium">
                                  {validation.slotErrors.get(key)?.[0]}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-theme-muted">Add period</span>
                          )}
                        </button>
                        {isActive ? (
                          <div className="absolute z-20 mt-2">
                            <TimetablePeriodForm
                              dayOfWeek={day.value}
                              dayLabel={day.label}
                              periodNumber={periodNumber}
                              value={period ?? null}
                              template={template}
                              subjects={classSubjects}
                              teachers={teachers}
                              classId={selectedClassId}
                              slotErrors={validation.slotErrors.get(key)}
                              onClose={() => setActiveSlot(null)}
                              onClear={() => {
                                updateDraft((current) => {
                                  const next = new Map(current);
                                  next.delete(key);
                                  return next;
                                });
                                setActiveSlot(null);
                              }}
                              onSave={(value) => {
                                updateDraft((current) => {
                                  const next = new Map(current);
                                  next.set(key, value);
                                  return next;
                                });
                                setActiveSlot(null);
                              }}
                              onApplyToWeekdays={(value) => {
                                updateDraft((current) => {
                                  const next = new Map(current);
                                  for (const weekday of TIMETABLE_DAYS) {
                                    next.set(slotKey(weekday.value, value.periodNumber), {
                                      ...value,
                                      dayOfWeek: weekday.value,
                                    });
                                  }
                                  return next;
                                });
                                setActiveSlot(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              )})}
            </tbody>
          </table>
          </div>
        </>
      ) : selectedClassId && templates.length === 0 && !isLoading ? (
        <EmptyState
          title="Set up school periods first"
          description="Define teaching periods for the school before building class timetables."
        />
      ) : isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : error ? (
        <EmptyState
          title="Could not load timetable"
          description="Check your connection and try again."
          onRetry={retry}
        />
      ) : !selectedClassId ? (
        <EmptyState
          title="Select a class"
          description="Choose a class to view or edit its weekly timetable."
        />
      ) : null}
    </div>
  );
}
