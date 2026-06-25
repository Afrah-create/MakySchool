import { apiClient } from "@/lib/api/client";
import type { StudentsListResponse } from "@/lib/students/types";

/** Load all active student IDs for a class (paginates past the API limit of 100). */
export async function fetchActiveStudentIdsForClass(classId: string): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  let total = 0;

  do {
    const response = await apiClient<StudentsListResponse>(
      `/schools/students?class_id=${encodeURIComponent(classId)}&status=active&page=${page}&limit=100`,
    );
    ids.push(...response.data.students.map((student) => student.id));
    total = response.data.total;
    page += 1;
  } while (ids.length < total && page <= 50);

  return ids;
}
