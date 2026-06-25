import type {
  SchoolPeriodTemplate,
  TimetablePeriod,
  TimetablePeriodInput,
  TimetableTrack,
} from "@makyschool/shared/types";
import type { TeacherListItem } from "@/lib/teachers/types";
import { slotKey, teacherAssignedToClassSubject } from "@/lib/timetable/utils";

const TRACK_VALUES: TimetableTrack[] = ["secular", "theology", "both"];

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const aStart = parseTime(startA);
  const aEnd = parseTime(endA);
  const bStart = parseTime(startB);
  const bEnd = parseTime(endB);
  return aStart < bEnd && aEnd > bStart;
}

export type TimetableValidationContext = {
  classId: string;
  linkedSubjectIds: Set<string>;
  teachers: TeacherListItem[];
  templates: SchoolPeriodTemplate[];
  otherClassPeriods: TimetablePeriod[];
};

export type TimetableValidationResult = {
  valid: boolean;
  globalErrors: string[];
  slotErrors: Map<string, string[]>;
};

export function applyTemplateTimes(
  draft: Map<string, TimetablePeriodInput>,
  templates: SchoolPeriodTemplate[],
): Map<string, TimetablePeriodInput> {
  const templateMap = new Map(templates.map((item) => [item.periodNumber, item]));
  const next = new Map<string, TimetablePeriodInput>();
  for (const [key, period] of draft.entries()) {
    const template = templateMap.get(period.periodNumber);
    next.set(key, {
      ...period,
      startTime: template?.startTime ?? period.startTime,
      endTime: template?.endTime ?? period.endTime,
    });
  }
  return next;
}

export function validateTimetableDraft(
  draft: Map<string, TimetablePeriodInput>,
  context: TimetableValidationContext,
): TimetableValidationResult {
  const globalErrors: string[] = [];
  const slotErrors = new Map<string, string[]>();
  const templateMap = new Map(context.templates.map((item) => [item.periodNumber, item]));

  if (context.templates.length === 0) {
    globalErrors.push("Define school teaching periods before saving timetables.");
    return { valid: false, globalErrors, slotErrors };
  }

  const periods = Array.from(draft.values());
  const addSlotError = (key: string, message: string) => {
    const current = slotErrors.get(key) ?? [];
    if (!current.includes(message)) current.push(message);
    slotErrors.set(key, current);
  };

  for (const period of periods) {
    const key = slotKey(period.dayOfWeek, period.periodNumber);
    const messages: string[] = [];

    if (period.dayOfWeek < 1 || period.dayOfWeek > 7) {
      messages.push("Invalid day of week.");
    }
    if (period.periodNumber < 1) {
      messages.push("Invalid period number.");
    }
    if (!TRACK_VALUES.includes(period.track)) {
      messages.push("Invalid track.");
    }
    if (!period.subjectId) {
      messages.push("Subject is required.");
    } else if (!context.linkedSubjectIds.has(period.subjectId)) {
      messages.push("Subject is not linked to this class.");
    }
    if (!period.teacherId) {
      messages.push("Teacher is required.");
    } else if (period.subjectId) {
      const teacher = context.teachers.find((item) => item.id === period.teacherId);
      if (
        !teacher ||
        !teacherAssignedToClassSubject(teacher, context.classId, period.subjectId)
      ) {
        messages.push("Teacher is not assigned to teach this subject in this class.");
      }
    }

    const template = templateMap.get(period.periodNumber);
    if (!template) {
      messages.push(`Period ${period.periodNumber} is not defined in the school schedule.`);
    } else {
      if (period.startTime !== template.startTime || period.endTime !== template.endTime) {
        messages.push(
          `Times must match the school schedule (${template.startTime}–${template.endTime}).`,
        );
      }
      if (parseTime(template.endTime) <= parseTime(template.startTime)) {
        messages.push("School period end time must be after start time.");
      }
    }

    if (messages.length > 0) {
      slotErrors.set(key, messages);
    }
  }

  const slotKeys = new Set<string>();
  for (const period of periods) {
    const key = slotKey(period.dayOfWeek, period.periodNumber);
    if (slotKeys.has(key)) {
      addSlotError(key, "Duplicate slot in this class timetable.");
    }
    slotKeys.add(key);
  }

  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      const a = periods[i];
      const b = periods[j];
      if (a.teacherId !== b.teacherId || a.dayOfWeek !== b.dayOfWeek) continue;
      if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        const keyA = slotKey(a.dayOfWeek, a.periodNumber);
        const keyB = slotKey(b.dayOfWeek, b.periodNumber);
        addSlotError(keyA, "Teacher has overlapping periods in this timetable.");
        addSlotError(keyB, "Teacher has overlapping periods in this timetable.");
      }
    }
  }

  for (const period of periods) {
    const key = slotKey(period.dayOfWeek, period.periodNumber);
    for (const other of context.otherClassPeriods) {
      if (other.class_id === context.classId) continue;
      if (other.teacher_id !== period.teacherId) continue;
      if (other.day_of_week !== period.dayOfWeek) continue;
      if (!timesOverlap(period.startTime, period.endTime, other.start_time, other.end_time)) {
        continue;
      }
      const teacherName = context.teachers.find((item) => item.id === period.teacherId)?.full_name;
      addSlotError(
        key,
        `${teacherName ?? "Teacher"} is already teaching ${other.class_name ?? "another class"} at this time.`,
      );
    }
  }

  const valid = globalErrors.length === 0 && slotErrors.size === 0;
  return { valid, globalErrors, slotErrors };
}

export function validateSchoolPeriodTemplates(
  templates: SchoolPeriodTemplate[],
): { valid: boolean; errors: string[]; fieldErrors: Record<string, string> } {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};
  if (templates.length === 0) {
    errors.push("Add at least one teaching period.");
    return { valid: false, errors, fieldErrors };
  }

  const numbers = new Set<number>();
  const ordered = [...templates].sort((a, b) => a.periodNumber - b.periodNumber);
  for (const [index, item] of ordered.entries()) {
    const prefix = `periods[${index}]`;
    if (item.periodNumber < 1) {
      fieldErrors[`${prefix}.periodNumber`] = "Period number must be at least 1.";
    }
    if (numbers.has(item.periodNumber)) {
      fieldErrors[`${prefix}.periodNumber`] = "Duplicate period number.";
    }
    numbers.add(item.periodNumber);
    if (!item.startTime || !item.endTime) {
      fieldErrors[`${prefix}.startTime`] = "Start and end times are required.";
      continue;
    }
    if (parseTime(item.endTime) <= parseTime(item.startTime)) {
      fieldErrors[`${prefix}.endTime`] = "End time must be after start time.";
    }
  }

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      if (timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        fieldErrors[`periods[${i}].startTime`] = "Overlaps another period.";
        fieldErrors[`periods[${j}].startTime`] = "Overlaps another period.";
      }
    }
  }

  const valid = errors.length === 0 && Object.keys(fieldErrors).length === 0;
  return { valid, errors, fieldErrors };
}

export const DEFAULT_SCHOOL_PERIOD_TEMPLATES: SchoolPeriodTemplate[] = Array.from(
  { length: 8 },
  (_, index) => {
    const periodNumber = index + 1;
    const startHour = 7 + Math.floor((index * 45) / 60);
    const startMinute = (index * 45) % 60;
    const endTotal = (startHour * 60 + startMinute + 40) % (24 * 60);
    const endHour = Math.floor(endTotal / 60);
    const endMinute = endTotal % 60;
    const format = (hour: number, minute: number) =>
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return {
      periodNumber,
      label: `Period ${periodNumber}`,
      startTime: format(startHour, startMinute),
      endTime: format(endHour, endMinute),
    };
  },
);
