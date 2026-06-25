import type { TeachingLoadSlot } from "@makyschool/shared/types";

export function slotKey(classId: string, subjectId: string) {
  return `${classId}:${subjectId}`;
}

export function parseSlotKey(key: string) {
  const [classId, subjectId] = key.split(":");
  return { classId, subjectId };
}

export function slotsForTeacher(slots: TeachingLoadSlot[], teacherId: string) {
  return slots.filter((slot) => slot.teacher_id === teacherId);
}

export function slotsForClass(slots: TeachingLoadSlot[], classId: string) {
  return slots.filter((slot) => slot.class_id === classId);
}

export function slotsForSubject(slots: TeachingLoadSlot[], subjectId: string) {
  return slots.filter((slot) => slot.subject_id === subjectId);
}

export function uniqueClasses(slots: TeachingLoadSlot[]) {
  const map = new Map<string, { id: string; name: string }>();
  for (const slot of slots) {
    if (!map.has(slot.class_id)) {
      map.set(slot.class_id, { id: slot.class_id, name: slot.class_name });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function uniqueSubjects(slots: TeachingLoadSlot[]) {
  const map = new Map<string, { id: string; name: string }>();
  for (const slot of slots) {
    if (!map.has(slot.subject_id)) {
      map.set(slot.subject_id, { id: slot.subject_id, name: slot.subject_name });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function assignmentsFromSelectedSlots(
  slots: TeachingLoadSlot[],
  selectedKeys: Set<string>,
) {
  return slots
    .filter((slot) => selectedKeys.has(slotKey(slot.class_id, slot.subject_id)))
    .map((slot) => ({
      class_id: slot.class_id,
      subject_id: slot.subject_id,
    }));
}

export function diffSlotUpdates(
  baseline: TeachingLoadSlot[],
  draft: Map<string, string | null>,
) {
  const updates: Array<{ class_id: string; subject_id: string; teacher_id: string | null }> = [];
  for (const [key, teacherId] of draft.entries()) {
    const slot = baseline.find((item) => slotKey(item.class_id, item.subject_id) === key);
    if (!slot) continue;
    const previous = slot.teacher_id ?? null;
    if (previous !== teacherId) {
      const { classId, subjectId } = parseSlotKey(key);
      updates.push({
        class_id: classId,
        subject_id: subjectId,
        teacher_id: teacherId,
      });
    }
  }
  return updates;
}
