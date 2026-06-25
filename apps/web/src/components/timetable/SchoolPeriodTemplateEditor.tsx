"use client";

import { useEffect, useMemo, useState } from "react";
import type { SchoolPeriodTemplate } from "@makyschool/shared/types";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { apiClient } from "@/lib/api/client";
import {
  DEFAULT_SCHOOL_PERIOD_TEMPLATES,
  validateSchoolPeriodTemplates,
} from "@/lib/timetable/validation";

type SchoolPeriodTemplateEditorProps = {
  templates: SchoolPeriodTemplate[];
  onSaved: (templates: SchoolPeriodTemplate[]) => void;
};

function normalizeTemplates(templates: SchoolPeriodTemplate[]) {
  return [...templates]
    .sort((a, b) => a.periodNumber - b.periodNumber)
    .map((item, index) => ({
      ...item,
      periodNumber: index + 1,
      label: item.label?.trim() || `Period ${index + 1}`,
    }));
}

function parseMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatDuration(startTime: string, endTime: string) {
  const minutes = parseMinutes(endTime) - parseMinutes(startTime);
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function rowFieldErrors(fieldErrors: Record<string, string>, index: number) {
  const prefix = `periods[${index}]`;
  return Object.entries(fieldErrors)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, message]) => ({ key, message }));
}

function PeriodScheduleStrip({
  periods,
  compact = false,
}: {
  periods: SchoolPeriodTemplate[];
  compact?: boolean;
}) {
  if (periods.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-1">
      <div className={`flex min-w-max gap-2 ${compact ? "" : "sm:gap-3"}`}>
        {periods.map((item, index) => (
          <div
            key={`${item.periodNumber}-${index}`}
            className={`relative flex shrink-0 items-stretch ${
              index < periods.length - 1 ? "pr-1" : ""
            }`}
          >
            <div
              className={`flex flex-col rounded-xl border border-theme bg-theme-surface shadow-sm ${
                compact ? "min-w-[7.5rem] px-3 py-2" : "min-w-[9rem] px-3.5 py-3"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-[11px] font-semibold text-theme-accent">
                  {item.periodNumber}
                </span>
                <span className={`font-semibold text-theme-primary ${compact ? "text-xs" : "text-sm"}`}>
                  {item.startTime}–{item.endTime}
                </span>
              </div>
              <p className={`mt-1 truncate text-theme-muted ${compact ? "text-[10px]" : "text-xs"}`}>
                {item.label ?? `Period ${item.periodNumber}`}
              </p>
              <p className={`mt-0.5 text-theme-muted/80 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                {formatDuration(item.startTime, item.endTime)}
              </p>
            </div>
            {index < periods.length - 1 ? (
              <span
                aria-hidden
                className="absolute -right-0.5 top-1/2 hidden h-px w-2 -translate-y-1/2 bg-theme-border sm:block"
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SchoolPeriodTemplateEditor({
  templates,
  onSaved,
}: SchoolPeriodTemplateEditorProps) {
  const [draft, setDraft] = useState<SchoolPeriodTemplate[]>(templates);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(templates.length === 0);

  useEffect(() => {
    setDraft(templates.length > 0 ? templates : DEFAULT_SCHOOL_PERIOD_TEMPLATES);
  }, [templates]);

  const validation = useMemo(() => validateSchoolPeriodTemplates(draft), [draft]);
  const displayPeriods = expanded ? draft : templates;
  const validationMessages = useMemo(
    () => [
      ...validation.errors.map((message, index) => ({
        key: `global-${index}`,
        message,
      })),
      ...Object.entries(validation.fieldErrors).map(([key, message]) => ({
        key,
        message,
      })),
    ],
    [validation.errors, validation.fieldErrors],
  );

  const updateRow = (index: number, patch: Partial<SchoolPeriodTemplate>) => {
    setDraft((current) =>
      current.map((item, rowIndex) => (rowIndex === index ? { ...item, ...patch } : item)),
    );
    setSaveError(null);
  };

  const addPeriod = () => {
    setDraft((current) => {
      const nextNumber = current.length + 1;
      const last = current[current.length - 1];
      const startTime = last?.endTime ?? "08:00";
      const [hours, minutes] = startTime.split(":").map(Number);
      const endTotal = hours * 60 + minutes + 40;
      const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
      return [
        ...current,
        {
          periodNumber: nextNumber,
          label: `Period ${nextNumber}`,
          startTime,
          endTime,
        },
      ];
    });
  };

  const removePeriod = (index: number) => {
    setDraft((current) => normalizeTemplates(current.filter((_, rowIndex) => rowIndex !== index)));
  };

  const handleSave = async () => {
    const normalized = normalizeTemplates(draft);
    const result = validateSchoolPeriodTemplates(normalized);
    if (!result.valid) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await apiClient<SchoolPeriodTemplate[]>("/schools/timetable/period-templates", {
        method: "PUT",
        body: { periods: normalized },
      });
      onSaved(response.data);
      setExpanded(false);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ms-card overflow-hidden">
      <div className="border-b border-theme bg-theme-surface/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-theme-muted">
              Bell schedule
            </p>
            <h2 className="mt-1 text-base font-semibold text-theme-primary">School teaching periods</h2>
            <p className="mt-1 max-w-2xl text-sm text-theme-muted">
              Set start and end times once for the whole school. Every class timetable uses these slots.
            </p>
          </div>
          <button
            type="button"
            className="ms-btn-ghost shrink-0 self-start"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Done editing" : templates.length === 0 ? "Set up periods" : "Edit schedule"}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        {displayPeriods.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-theme-muted">
                {expanded ? "Live preview" : `${displayPeriods.length} periods configured`}
              </p>
              {!expanded && templates.length > 0 ? (
                <p className="text-xs text-theme-muted">
                  {templates[0]?.startTime} → {templates[templates.length - 1]?.endTime}
                </p>
              ) : null}
            </div>
            <PeriodScheduleStrip periods={displayPeriods} compact={!expanded} />
          </div>
        ) : null}

        {expanded ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-theme-muted">Edit periods</p>
            <div className="space-y-2">
              {draft.map((item, index) => {
                const errors = rowFieldErrors(validation.fieldErrors, index);
                const hasError = errors.length > 0;

                return (
                  <div
                    key={`edit-${item.periodNumber}-${index}`}
                    className={`rounded-xl border bg-theme-surface p-3 sm:p-4 ${
                      hasError ? "border-theme-danger/40 bg-theme-danger/5" : "border-theme"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex items-center gap-3 sm:w-28 sm:shrink-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-theme-accent-muted text-sm font-semibold text-theme-accent">
                          {item.periodNumber}
                        </span>
                        <div className="sm:hidden">
                          <p className="text-sm font-medium text-theme-primary">
                            {item.label ?? `Period ${item.periodNumber}`}
                          </p>
                          <p className="text-xs text-theme-muted">
                            {formatDuration(item.startTime, item.endTime)}
                          </p>
                        </div>
                      </div>

                      <label className="block min-w-0 flex-1 space-y-1">
                        <span className="text-xs font-medium text-theme-muted">Label</span>
                        <input
                          className="ms-input w-full"
                          value={item.label ?? ""}
                          placeholder={`Period ${item.periodNumber}`}
                          onChange={(event) => updateRow(index, { label: event.target.value })}
                        />
                      </label>

                      <label className="block w-full space-y-1 sm:w-32">
                        <span className="text-xs font-medium text-theme-muted">Start</span>
                        <input
                          type="time"
                          className="ms-input w-full"
                          value={item.startTime}
                          onChange={(event) => updateRow(index, { startTime: event.target.value })}
                        />
                      </label>

                      <label className="block w-full space-y-1 sm:w-32">
                        <span className="text-xs font-medium text-theme-muted">End</span>
                        <input
                          type="time"
                          className="ms-input w-full"
                          value={item.endTime}
                          onChange={(event) => updateRow(index, { endTime: event.target.value })}
                        />
                      </label>

                      <div className="hidden w-20 shrink-0 text-center sm:block">
                        <p className="text-xs font-medium text-theme-muted">Duration</p>
                        <p className="mt-2 text-sm font-medium text-theme-primary">
                          {formatDuration(item.startTime, item.endTime)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="ms-btn-ghost w-full px-3 text-xs text-theme-muted hover:text-theme-danger sm:w-auto"
                        onClick={() => removePeriod(index)}
                        disabled={draft.length <= 1}
                      >
                        Remove
                      </button>
                    </div>

                    {hasError ? (
                      <ul className="mt-3 space-y-1 border-t border-theme-danger/20 pt-3 text-xs text-theme-danger">
                        {errors.map(({ key, message }) => (
                          <li key={key}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!validation.valid && validationMessages.length > 0 ? (
              <div className="rounded-xl border border-theme-danger/30 bg-theme-danger/5 px-4 py-3 text-sm text-theme-danger">
                <p className="font-medium">Fix schedule issues before saving</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {validationMessages.map(({ key, message }) => (
                    <li key={key}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {saveError ? (
              <div className="badge-danger rounded-xl px-4 py-3 text-sm">{saveError}</div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-theme pt-4">
              <button type="button" className="ms-btn-ghost" onClick={addPeriod}>
                Add period
              </button>
              <LoadingButton
                loading={saving}
                disabled={!validation.valid}
                onClick={() => void handleSave()}
              >
                Save school periods
              </LoadingButton>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
