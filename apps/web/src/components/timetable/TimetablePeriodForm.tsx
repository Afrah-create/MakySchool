"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  SchoolPeriodTemplate,
  SubjectWithDetails,
  TimetablePeriodInput,
  TimetableTrack,
} from "@makyschool/shared/types";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import type { TeacherListItem } from "@/lib/teachers/types";
import { teacherAssignedToClassSubject } from "@/lib/timetable/utils";

type TimetablePeriodFormProps = {
  dayOfWeek: number;
  dayLabel: string;
  periodNumber: number;
  value: TimetablePeriodInput | null;
  template: SchoolPeriodTemplate | null;
  subjects: SubjectWithDetails[];
  teachers: TeacherListItem[];
  classId: string;
  slotErrors?: string[];
  onSave: (value: TimetablePeriodInput) => void;
  onApplyToWeekdays?: (value: Omit<TimetablePeriodInput, "dayOfWeek">) => void;
  onClear: () => void;
  onClose: () => void;
};

const TRACK_OPTIONS: { value: TimetableTrack; label: string }[] = [
  { value: "secular", label: "Secular" },
  { value: "theology", label: "Theology" },
  { value: "both", label: "Both" },
];

export function TimetablePeriodForm({
  dayOfWeek,
  dayLabel,
  periodNumber,
  value,
  template,
  subjects,
  teachers,
  classId,
  slotErrors = [],
  onSave,
  onApplyToWeekdays,
  onClear,
  onClose,
}: TimetablePeriodFormProps) {
  const [subjectId, setSubjectId] = useState(value?.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(value?.teacherId ?? "");
  const [track, setTrack] = useState<TimetableTrack>(value?.track ?? "secular");

  const eligibleTeachers = useMemo(() => {
    if (!subjectId) return [];
    return teachers.filter((teacher) =>
      teacherAssignedToClassSubject(teacher, classId, subjectId),
    );
  }, [classId, subjectId, teachers]);

  const canApply = Boolean(subjectId && teacherId && template);
  const periodValue = {
    periodNumber,
    startTime: template?.startTime ?? value?.startTime ?? "08:00",
    endTime: template?.endTime ?? value?.endTime ?? "08:40",
    subjectId,
    teacherId,
    track,
  };

  return (
    <div className="ms-card w-full max-w-sm space-y-4 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
            Period {periodNumber}
          </p>
          <h3 className="text-sm font-semibold text-theme-primary">{dayLabel}</h3>
          {template ? (
            <p className="mt-1 text-xs text-theme-muted">
              {template.label ?? `Period ${periodNumber}`} · {template.startTime}–{template.endTime}
            </p>
          ) : (
            <p className="mt-1 text-xs text-theme-danger">
              This period is not defined in the school schedule.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-theme-muted hover:text-theme-primary"
        >
          Close
        </button>
      </div>

      {slotErrors.length > 0 ? (
        <div className="rounded-lg border border-theme-danger/30 bg-theme-danger/5 px-3 py-2 text-xs text-theme-danger">
          <ul className="list-disc space-y-1 pl-4">
            {slotErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-theme-muted">Subject</span>
        <select
          className="ms-input w-full"
          value={subjectId}
          onChange={(event) => {
            setSubjectId(event.target.value);
            setTeacherId("");
          }}
        >
          <option value="">Select subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-theme-muted">Teacher</span>
        <select
          className="ms-input w-full"
          value={teacherId}
          disabled={!subjectId}
          onChange={(event) => setTeacherId(event.target.value)}
        >
          <option value="">Select teacher</option>
          {eligibleTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.full_name}
            </option>
          ))}
        </select>
        {subjectId && eligibleTeachers.length === 0 ? (
          <p className="mt-1 text-xs text-theme-muted">
            No teacher assigned for this class and subject.{" "}
            <Link
              href={`/dashboard/teaching-load?mode=by-class&classId=${classId}`}
              className="text-theme-accent hover:underline"
            >
              Assign in Teaching load
            </Link>
          </p>
        ) : null}
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-theme-muted">Track</span>
        <select
          className="ms-input w-full"
          value={track}
          onChange={(event) => setTrack(event.target.value as TimetableTrack)}
        >
          {TRACK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        <LoadingButton
          type="button"
          className="flex-1"
          disabled={!canApply}
          onClick={() =>
            onSave({
              dayOfWeek,
              ...periodValue,
            })
          }
        >
          Apply
        </LoadingButton>
        {onApplyToWeekdays ? (
          <LoadingButton
            type="button"
            className="flex-1"
            variant="ghost"
            disabled={!canApply}
            onClick={() => onApplyToWeekdays(periodValue)}
          >
            Apply to all days
          </LoadingButton>
        ) : null}
        {value ? (
          <button type="button" className="ms-btn-ghost px-3" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
