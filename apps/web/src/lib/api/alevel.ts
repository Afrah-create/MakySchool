import { apiClient } from './client';
import type {
  ALevelSubject,
  ALevelClass,
  ALevelCombination,
  ALevelEnrollment,
  ALevelEnrollmentFilters,
  ALevelTermOption,
  ALevelExam,
  ALevelExamFilters,
  ALevelExamType,
  BulkALevelEnrollmentPayload,
  BulkALevelEnrollmentResult,
  BulkUpdateALevelEnrollmentsPayload,
  ALevelGradingScale,
  ALevelGradesGrid,
  ALevelReportCard,
  ALevelResultsResponse,
  CreateALevelExamPayload,
  CreateALevelExamTypePayload,
  CreateALevelSubjectPayload,
  UpdateALevelExamPayload,
  UpdateALevelExamTypePayload,
  UpdateALevelSubjectPayload,
  CreateALevelCombinationPayload,
  CreateALevelEnrollmentPayload,
  UpdateALevelEnrollmentPayload,
  SaveALevelGradesPayload,
  SaveALevelGradesResult,
} from '@makyschool/shared';

const BASE = '/api/schools/alevel';

export const alevelApi = {
  listClasses() {
    return apiClient<ALevelClass[]>(`${BASE}/classes`).then((r) => r.data);
  },

  listTerms() {
    return apiClient<ALevelTermOption[]>(`${BASE}/terms`).then((r) => r.data);
  },

  getGradingScale() {
    return apiClient<ALevelGradingScale>(`${BASE}/grading-scale`).then(
      (r) => r.data,
    );
  },

  saveGradingScale(payload: ALevelGradingScale) {
    return apiClient<{
      ok: boolean;
      existingGradeCount: number;
      message?: string;
    }>(`${BASE}/grading-scale`, {
      method: 'PUT',
      body: payload,
    }).then((r) => r.data);
  },

  listExamTypes(includeInactive = false) {
    const q = includeInactive ? '?include_inactive=true' : '';
    return apiClient<ALevelExamType[]>(`${BASE}/exam-types${q}`).then(
      (r) => r.data,
    );
  },

  createExamType(payload: CreateALevelExamTypePayload) {
    return apiClient<ALevelExamType>(`${BASE}/exam-types`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  updateExamType(id: string, payload: UpdateALevelExamTypePayload) {
    return apiClient<ALevelExamType>(`${BASE}/exam-types/${id}`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => r.data);
  },

  deleteExamType(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/exam-types/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  listExams(params: ALevelExamFilters = {}) {
    const q = new URLSearchParams();
    if (params.classId) q.set('class_id', params.classId);
    if (params.termId) q.set('term_id', params.termId);
    if (params.academicYearId) q.set('academic_year_id', params.academicYearId);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return apiClient<ALevelExam[]>(`${BASE}/exams${qs ? `?${qs}` : ''}`).then(
      (r) => r.data,
    );
  },

  createExam(payload: CreateALevelExamPayload) {
    return apiClient<ALevelExam>(`${BASE}/exams`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  updateExam(id: string, payload: UpdateALevelExamPayload) {
    return apiClient<ALevelExam>(`${BASE}/exams/${id}`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => r.data);
  },

  deleteExam(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/exams/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  openExam(id: string) {
    return apiClient<ALevelExam>(`${BASE}/exams/${id}/open`, {
      method: 'POST',
    }).then((r) => r.data);
  },

  closeExam(id: string) {
    return apiClient<ALevelExam>(`${BASE}/exams/${id}/close`, {
      method: 'POST',
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

  listEnrollments(params: ALevelEnrollmentFilters = {}) {
    const q = new URLSearchParams();
    if (params.academicYearId) q.set('academic_year_id', params.academicYearId);
    if (params.classId) q.set('class_id', params.classId);
    if (params.combinationId) q.set('combination_id', params.combinationId);
    if (params.category) q.set('category', params.category);
    if (params.search) q.set('search', params.search);
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

  bulkCreateEnrollments(payload: BulkALevelEnrollmentPayload) {
    return apiClient<BulkALevelEnrollmentResult>(`${BASE}/enrollments/bulk`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  updateEnrollment(id: string, payload: UpdateALevelEnrollmentPayload) {
    return apiClient<ALevelEnrollment>(`${BASE}/enrollments/${id}`, {
      method: 'PATCH',
      body: payload,
    }).then((r) => r.data);
  },

  bulkUpdateEnrollments(payload: BulkUpdateALevelEnrollmentsPayload) {
    return apiClient<{ updated: number }>(`${BASE}/enrollments/bulk-update`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  deleteEnrollment(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/enrollments/${id}`, {
      method: 'DELETE',
    }).then((r) => r.data);
  },

  getGrades(examId: string) {
    const q = new URLSearchParams({ exam_id: examId });
    return apiClient<ALevelGradesGrid>(`${BASE}/grades?${q.toString()}`).then(
      (r) => r.data,
    );
  },

  saveGrades(payload: SaveALevelGradesPayload) {
    return apiClient<SaveALevelGradesResult>(`${BASE}/grades/bulk`, {
      method: 'POST',
      body: payload,
    }).then((r) => r.data);
  },

  submitMarks(examId: string) {
    return apiClient<{ ok: boolean; isSubmitted?: boolean; submittedAt?: string }>(
      `${BASE}/exams/${examId}/submit`,
      { method: 'POST' },
    ).then((r) => r.data);
  },

  unlockTeacherSubmission(examId: string, teacherId: string) {
    return apiClient<{ ok: boolean; teacherId: string }>(
      `${BASE}/exams/${examId}/submissions/${teacherId}/unlock`,
      { method: 'POST' },
    ).then((r) => r.data);
  },

  getResults(examId: string) {
    const q = new URLSearchParams({ exam_id: examId });
    return apiClient<ALevelResultsResponse>(
      `${BASE}/results?${q.toString()}`,
    ).then((r) => r.data);
  },

  getReportCard(studentId: string, examId: string) {
    const q = new URLSearchParams({ exam_id: examId });
    return apiClient<ALevelReportCard>(
      `${BASE}/report-card/${studentId}?${q.toString()}`,
    ).then((r) => r.data);
  },

  saveReportComment(
    studentId: string,
    examId: string,
    payload: {
      classTeacherComment?: string | null;
      headTeacherComment?: string | null;
      approve?: boolean;
    },
  ) {
    const q = new URLSearchParams({ exam_id: examId });
    return apiClient<{ ok: boolean; approved: boolean }>(
      `${BASE}/report-card/${studentId}/comment?${q.toString()}`,
      { method: 'POST', body: payload },
    ).then((r) => r.data);
  },

  generateReportCards(params: { examId: string; studentId?: string }) {
    const q = new URLSearchParams({ exam_id: params.examId });
    if (params.studentId) q.set('student_id', params.studentId);
    return apiClient<{
      filename: string;
      pdfBase64?: string;
      count?: number;
    }>(`${BASE}/report-cards/generate?${q.toString()}`, {
      method: 'POST',
    }).then((r) => r.data);
  },
};
