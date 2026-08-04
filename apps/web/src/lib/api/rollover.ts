import { apiClient } from "@/lib/api/client";
import type {
  FeeStructurePreviewRow,
  PromotionPreviewResponse,
  RolloverExecuteResult,
  RolloverSession,
  TeacherAssignmentPreviewRow,
} from "@makyschool/shared/types";
import type { RolloverTrack } from "@makyschool/shared/constants";

export async function listRolloverSessions() {
  const res = await apiClient<RolloverSession[]>("/schools/rollover/sessions");
  return res.data;
}

export async function startRolloverSession(track: RolloverTrack, fromAcademicYearId?: string) {
  const res = await apiClient<RolloverSession>("/schools/rollover/sessions", {
    method: "POST",
    body: {
      track,
      ...(fromAcademicYearId ? { fromAcademicYearId } : {}),
    },
  });
  return res.data;
}

export async function getRolloverSession(sessionId: string) {
  const res = await apiClient<RolloverSession>(`/schools/rollover/sessions/${sessionId}`);
  return res.data;
}

export async function patchRolloverSession(
  sessionId: string,
  body: { currentStep?: number; draft?: Record<string, unknown> },
) {
  const res = await apiClient<RolloverSession>(`/schools/rollover/sessions/${sessionId}`, {
    method: "PATCH",
    body,
  });
  return res.data;
}

export async function cancelRolloverSession(sessionId: string) {
  const res = await apiClient<RolloverSession>(`/schools/rollover/sessions/${sessionId}/cancel`, {
    method: "POST",
    body: {},
  });
  return res.data;
}

export async function executeRolloverSession(sessionId: string, idempotencyKey: string) {
  const res = await apiClient<RolloverExecuteResult>(
    `/schools/rollover/sessions/${sessionId}/execute`,
    {
      method: "POST",
      body: { idempotencyKey },
    },
  );
  return res.data;
}

export async function fetchPromotionPreview(track: RolloverTrack, fromAcademicYearId: string) {
  const q = new URLSearchParams({ track, fromAcademicYearId });
  const res = await apiClient<PromotionPreviewResponse>(
    `/schools/rollover/promotion-preview?${q.toString()}`,
  );
  return res.data;
}

export async function fetchTeacherPreview(track: RolloverTrack, fromAcademicYearId: string) {
  const q = new URLSearchParams({ track, fromAcademicYearId });
  const res = await apiClient<{
    assignments: TeacherAssignmentPreviewRow[];
    summary: { total: number; mappable: number; unmapped: number };
  }>(`/schools/rollover/teacher-preview?${q.toString()}`);
  return res.data;
}

export async function fetchFeePreview(track: RolloverTrack, fromAcademicYearId: string) {
  const q = new URLSearchParams({ track, fromAcademicYearId });
  const res = await apiClient<{
    structures: FeeStructurePreviewRow[];
    summary: { total: number; lineItems: number };
  }>(`/schools/rollover/fee-preview?${q.toString()}`);
  return res.data;
}

export async function fetchTimetablePreview(
  track: RolloverTrack,
  fromAcademicYearId: string,
  sourceTermId?: string | null,
) {
  const q = new URLSearchParams({ track, fromAcademicYearId });
  if (sourceTermId) q.set("sourceTermId", sourceTermId);
  const res = await apiClient<{
    sourceTermId: string | null;
    terms: Array<{ id: string; name: string; startDate: string | null; endDate: string | null }>;
    periods: Array<{
      periodId: string;
      fromClassLabel: string;
      toClassLabel: string | null;
      mappable: boolean;
    }>;
    summary: { total: number; mappable: number; unmapped: number };
  }>(`/schools/rollover/timetable-preview?${q.toString()}`);
  return res.data;
}

export async function fetchRolloverHistory() {
  const res = await apiClient<
    Array<{
      id: string;
      track: RolloverTrack;
      fromYear: number;
      toYear: number;
      performedAt: string | null;
      performedByName: string | null;
      summary: string;
      counts: Record<string, number>;
    }>
  >("/schools/rollover/history");
  return res.data;
}
