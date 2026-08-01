import { apiClient } from '@/lib/api/client';
import type {
  ManualMarkPayload,
  TeacherAttendanceDetailResponse,
  TeacherAttendanceHistoryResponse,
  TeacherAttendanceSettingsPatch,
  TeacherAttendanceSettingsResponse,
  TeacherClockCoords,
  TeacherClockInResult,
  TeacherClockOutResult,
  TeacherMapDataResponse,
  TeacherMyStatusResponse,
  TeacherTodayResponse,
} from '@makyschool/shared';

const BASE = '/api/schools/teacher-attendance';

function qs(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const teacherAttendanceApi = {
  getSettings() {
    return apiClient<TeacherAttendanceSettingsResponse>(`${BASE}/settings`).then(
      (r) => r.data,
    );
  },

  updateSettings(body: TeacherAttendanceSettingsPatch) {
    return apiClient<TeacherAttendanceSettingsResponse>(`${BASE}/settings`, {
      method: 'PATCH',
      body,
    }).then((r) => r.data);
  },

  clockIn(coords: TeacherClockCoords) {
    return apiClient<TeacherClockInResult>(`${BASE}/clock-in`, {
      method: 'POST',
      body: coords,
    }).then((r) => ({ ...r.data, message: r.message ?? r.data.message }));
  },

  clockOut(coords: TeacherClockCoords) {
    return apiClient<TeacherClockOutResult>(`${BASE}/clock-out`, {
      method: 'POST',
      body: coords,
    }).then((r) => ({ ...r.data, message: r.message ?? r.data.message }));
  },

  myStatus() {
    return apiClient<TeacherMyStatusResponse>(`${BASE}/my-status`).then(
      (r) => r.data,
    );
  },

  today(date?: string) {
    return apiClient<TeacherTodayResponse>(
      `${BASE}/today${qs({ date })}`,
    ).then((r) => r.data);
  },

  history(params: {
    teacherId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) {
    return apiClient<TeacherAttendanceHistoryResponse>(
      `${BASE}/history${qs({
        teacher_id: params.teacherId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
        status: params.status,
        page: params.page,
        limit: params.limit,
      })}`,
    ).then((r) => r.data);
  },

  teacherDetail(teacherId: string, month?: string) {
    return apiClient<TeacherAttendanceDetailResponse>(
      `${BASE}/teacher/${teacherId}${qs({ month })}`,
    ).then((r) => r.data);
  },

  mapData(date?: string) {
    return apiClient<TeacherMapDataResponse>(
      `${BASE}/map-data${qs({ date })}`,
    ).then((r) => r.data);
  },

  manualMark(payload: ManualMarkPayload) {
    return apiClient<{ ok: boolean }>(`${BASE}/manual`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => ({ data: r.data, message: r.message }));
  },
};
