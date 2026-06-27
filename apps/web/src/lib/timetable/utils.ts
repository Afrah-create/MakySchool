import type { TimetablePeriod, TimetablePeriodInput, TimetableTrack } from "@makyschool/shared/types";
import type { TeacherAssignment, TeacherListItem } from "@/lib/teachers/types";

export const TIMETABLE_DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export const DEFAULT_PERIOD_COUNT = 8;

export const TRACK_TONE: Record<TimetableTrack, string> = {
  secular: "bg-theme-accent-muted text-theme-accent",
  theology: "badge-role-teacher",
  both: "badge-success",
};

export function slotKey(dayOfWeek: number, periodNumber: number) {
  return `${dayOfWeek}-${periodNumber}`;
}

export function parseSlotKey(key: string) {
  const [day, period] = key.split("-").map(Number);
  return { dayOfWeek: day, periodNumber: period };
}

export function teacherInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function periodsToMap(periods: TimetablePeriod[]) {
  const map = new Map<string, TimetablePeriod>();
  for (const period of periods) {
    map.set(slotKey(period.day_of_week, period.period_number), period);
  }
  return map;
}

export function mapToPayload(
  map: Map<string, TimetablePeriodInput>,
): TimetablePeriodInput[] {
  return Array.from(map.values()).sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.periodNumber - b.periodNumber;
  });
}

export function periodToInput(period: TimetablePeriod): TimetablePeriodInput {
  return {
    dayOfWeek: period.day_of_week,
    periodNumber: period.period_number,
    startTime: period.start_time,
    endTime: period.end_time,
    subjectId: period.subject_id,
    teacherId: period.teacher_id,
    track: period.track,
  };
}

export function resolvePeriodCount(
  periods: TimetablePeriod[],
  templateCount = 0,
) {
  const fromSaved = periods.length > 0 ? Math.max(...periods.map((p) => p.period_number)) : 0;
  return Math.max(DEFAULT_PERIOD_COUNT, templateCount, fromSaved);
}

export function todayDayOfWeek() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** Format API time (HH:MM or HH:MM:SS) for display. */
export function formatTimetableTime(value: string) {
  const [hourPart, minutePart = "00"] = value.split(":");
  const hour = Number.parseInt(hourPart, 10);
  if (Number.isNaN(hour)) return value;
  const minutes = minutePart.slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

export function dayLabelForValue(dayValue: number) {
  return TIMETABLE_DAYS.find((day) => day.value === dayValue)?.label ?? "Day";
}

export function normalizeClassIds(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeTeacherAssignments(
  raw: TeacherAssignment[] | string | undefined,
): TeacherAssignment[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is TeacherAssignment => typeof item === "object" && item !== null);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

export function normalizeTeachers(teachers: TeacherListItem[]): TeacherListItem[] {
  return teachers.map((teacher) => ({
    ...teacher,
    assignments: normalizeTeacherAssignments(teacher.assignments),
  }));
}

export function teacherAssignedToClassSubject(
  teacher: TeacherListItem,
  classId: string,
  subjectId: string,
) {
  return normalizeTeacherAssignments(teacher.assignments).some(
    (assignment) => assignment.class_id === classId && assignment.subject_id === subjectId,
  );
}
