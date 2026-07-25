import { apiClient } from './client';
import type {
  ALevelSubject,
  ALevelCombination,
  ALevelEnrollment,
  ALevelTermOption,
  ALevelGradingScale,
  ALevelGradesGrid,
  ALevelResultsResponse,
  CreateALevelSubjectPayload,
  UpdateALevelSubjectPayload,
  CreateALevelCombinationPayload,
  CreateALevelEnrollmentPayload,
  SaveALevelGradesPayload,
} from '@makyschool/shared';

const BASE = '/api/schools/alevel';

export const alevelApi = {
  listTerms() {
    return apiClient<ALevelTermOption[]>(`${BASE}/terms`).then((r) => r.data);
  },

  getGradingScale() {
    return apiClient<ALevelGradingScale>(`${BASE}/grading-scale`).then(
      (r) => r.data,
    );
  },

  saveGradingScale(payload: ALevelGradingScale) {
    return apiClient<{ ok: boolean }>(`${BASE}/grading-scale`, {
      method: 'PUT',
      body: payload,
    }).then((r) => r.data);
  },

  listSubjects() {
    return apiClient<ALevelSubject[]>(`${BASE}/subjects`).then((r) => r.data);
  },

  createSubject(payload: CreateALevelSubjectPayload) {
    return apiClient<ALevelSubject>(`${BASE}/subjects`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  updateSubject(id: string, payload: UpdateALevelSubjectPayload) {
    return apiClient<ALevelSubject>(`${BASE}/subjects/${id}`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => r.data);
  },

  deleteSubject(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/subjects/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  listCombinations() {
    return apiClient<ALevelCombination[]>(`${BASE}/combinations`).then(
      (r) => r.data,
    );
  },

  createCombination(payload: CreateALevelCombinationPayload) {
    return apiClient<ALevelCombination>(`${BASE}/combinations`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  updateCombination(id: string, payload: CreateALevelCombinationPayload) {
    return apiClient<ALevelCombination>(`${BASE}/combinations/${id}`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => r.data);
  },

  deleteCombination(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/combinations/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  listEnrollments(params: { academicYearId?: string; classId?: string } = {}) {
    const q = new URLSearchParams();
    if (params.academicYearId) q.set('academic_year_id', params.academicYearId);
    if (params.classId) q.set('class_id', params.classId);
    const qs = q.toString();
    return apiClient<ALevelEnrollment[]>(
      `${BASE}/enrollments${qs ? `?${qs}` : ''}`,
    ).then((r) => r.data);
  },

  createEnrollment(payload: CreateALevelEnrollmentPayload) {
    return apiClient<ALevelEnrollment>(`${BASE}/enrollments`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  deleteEnrollment(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/enrollments/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  getGrades(classId: string, termId: string, academicYearId: string) {
    const q = new URLSearchParams({
      class_id: classId,
      term_id: termId,
      academic_year_id: academicYearId,
    });
    return apiClient<ALevelGradesGrid>(`${BASE}/grades?${q.toString()}`).then(
      (r) => r.data,
    );
  },

  saveGrades(payload: SaveALevelGradesPayload) {
    return apiClient<{ saved: number }>(`${BASE}/grades/bulk`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  getResults(classId: string, termId: string, academicYearId: string) {
    const q = new URLSearchParams({
      class_id: classId,
      term_id: termId,
      academic_year_id: academicYearId,
    });
    return apiClient<ALevelResultsResponse>(
      `${BASE}/results?${q.toString()}`,
    ).then((r) => r.data);
  },
};
