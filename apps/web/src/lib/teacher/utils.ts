import type { TeacherDetail } from "@/lib/teachers/types";

export function buildTeacherClassMap(assignments: TeacherDetail["assignments"]) {
  const classMap = new Map<string, TeacherDetail["assignments"]>();

  for (const item of assignments) {
    const list = classMap.get(item.class_id) ?? [];
    list.push(item);
    classMap.set(item.class_id, list);
  }

  return classMap;
}

export function marksStatusBadgeClass(status: string | undefined) {
  switch (status) {
    case "submitted":
      return "badge-success";
    case "draft":
      return "badge-warning";
    default:
      return "bg-theme-raised text-theme-muted";
  }
}
