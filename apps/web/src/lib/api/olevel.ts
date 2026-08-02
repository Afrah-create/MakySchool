import { apiClient } from "./client";
import type {
  AssessmentCategory,
  BulkMarkPayload,
  CurriculumReportRules,
  CurriculumSubject,
  OLevelClassOption,
  OLevelClassResultsResponse,
  OLevelCurriculum,
  OLevelExamSession,
  OLevelGradeScale,
  OLevelMarkGridResponse,
  OLevelMarkSubmission,
  OLevelOverview,
  OLevelSubject,
  OLevelTermOption,
  PromotionRules,
  SelectionRule,
  StudentCurriculumEnrollment,
  StudentSubjectRegistration,
  TeacherOLevelAssignment,
} from "@makyschool/shared";

const BASE = "/api/schools/olevel";

async function blobRequest(path: string, init?: RequestInit): Promise<Blob> {
  const { resolveClientApiUrl } = await import("./base-url");
  const { CLIENT_APP_HEADER, TENANT_HEADERS } = await import(
    "@makyschool/shared/constants"
  );
  const { readStoredSchoolSlug } = await import("@/lib/auth/session");
  const slug =
    (typeof document !== "undefined" && document.body.dataset.schoolSlug) ||
    readStoredSchoolSlug() ||
    "";
  const headers = new Headers(init?.headers || {});
  if (slug) headers.set(TENANT_HEADERS.SCHOOL_SLUG, slug);
  headers.set(CLIENT_APP_HEADER, "tenant");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(resolveClientApiUrl(path), {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as Record<string, unknown>));
    const detail = err?.detail as { error?: string } | undefined;
    throw new Error(
      (err?.error as string) || detail?.error || "Request failed",
    );
  }
  return res.blob();
}

export const olevelApi = {
  overview() {
    return apiClient<OLevelOverview>(`${BASE}/overview`).then((r) => r.data);
  },

  listClasses() {
    return apiClient<OLevelClassOption[]>(`${BASE}/classes`).then((r) => r.data);
  },

  listTerms() {
    return apiClient<OLevelTermOption[]>(`${BASE}/terms`).then((r) => r.data);
  },

  getCurriculum() {
    return apiClient<OLevelCurriculum | null>(`${BASE}/curriculum`).then((r) => r.data);
  },

  setupCurriculum(body: {
    name?: string;
    description?: string;
    academicYearFrom: number;
    seedDefaults?: boolean;
  }) {
    return apiClient<OLevelCurriculum>(`${BASE}/curriculum/setup`, {
      method: "POST",
      body: {
        name: body.name ?? "Uganda NLSC CBC",
        description: body.description,
        academicYearFrom: body.academicYearFrom,
        seedDefaults: body.seedDefaults ?? true,
      },
    }).then((r) => r.data);
  },

  patchCurriculum(id: string, body: Record<string, unknown>) {
    return apiClient<OLevelCurriculum>(`${BASE}/curriculum/${id}`, {
      method: "PATCH",
      body,
    }).then((r) => r.data);
  },

  putGradeScale(id: string, items: Partial<OLevelGradeScale>[]) {
    return apiClient<OLevelGradeScale[]>(`${BASE}/curriculum/${id}/grade-scale`, {
      method: "PUT",
      body: items,
    }).then((r) => r.data);
  },

  putCategories(id: string, items: Partial<AssessmentCategory>[]) {
    return apiClient<AssessmentCategory[]>(
      `${BASE}/curriculum/${id}/assessment-categories`,
      { method: "PUT", body: items },
    ).then((r) => r.data);
  },

  putSelectionRules(id: string, items: Partial<SelectionRule>[]) {
    return apiClient<SelectionRule[]>(`${BASE}/curriculum/${id}/selection-rules`, {
      method: "PUT",
      body: items,
    }).then((r) => r.data);
  },

  putPromotionRules(id: string, body: Partial<PromotionRules>) {
    return apiClient<PromotionRules>(`${BASE}/curriculum/${id}/promotion-rules`, {
      method: "PUT",
      body,
    }).then((r) => r.data);
  },

  putReportRules(id: string, body: Partial<CurriculumReportRules>) {
    return apiClient<CurriculumReportRules>(`${BASE}/curriculum/${id}/report-rules`, {
      method: "PUT",
      body,
    }).then((r) => r.data);
  },

  listSubjects(params?: { isActive?: boolean; department?: string }) {
    const qs = new URLSearchParams();
    if (params?.isActive != null) qs.set("is_active", String(params.isActive));
    if (params?.department) qs.set("department", params.department);
    const q = qs.toString();
    return apiClient<OLevelSubject[]>(`${BASE}/subjects${q ? `?${q}` : ""}`).then(
      (r) => r.data,
    );
  },

  createSubject(body: {
    name: string;
    code: string;
    abbreviation?: string;
    department?: string;
  }) {
    return apiClient<OLevelSubject>(`${BASE}/subjects`, { method: "POST", body }).then(
      (r) => r.data,
    );
  },

  listCurriculumSubjects(curriculumId: string) {
    return apiClient<CurriculumSubject[]>(
      `${BASE}/curriculum/${curriculumId}/subjects`,
    ).then((r) => r.data);
  },

  assignCurriculumSubject(
    curriculumId: string,
    body: {
      subjectId: string;
      subjectRole: string;
      appliesToLevels: string[];
      displayOrder?: number;
    },
  ) {
    return apiClient<CurriculumSubject>(`${BASE}/curriculum/${curriculumId}/subjects`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  replaceBandSubjects(
    curriculumId: string,
    body: {
      appliesToLevels: string[];
      subjects: Array<{ subjectId: string; subjectRole: string }>;
    },
  ) {
    return apiClient<CurriculumSubject[]>(
      `${BASE}/curriculum/${curriculumId}/subjects/band`,
      { method: "PUT", body },
    ).then((r) => r.data);
  },

  updateCurriculumSubject(
    curriculumId: string,
    subjectId: string,
    body: {
      subjectRole?: string;
      appliesToLevels?: string[];
      displayOrder?: number;
      isActive?: boolean;
    },
  ) {
    return apiClient<CurriculumSubject>(
      `${BASE}/curriculum/${curriculumId}/subjects/${subjectId}`,
      { method: "PATCH", body },
    ).then((r) => r.data);
  },

  removeCurriculumSubject(curriculumId: string, subjectId: string) {
    return apiClient(`${BASE}/curriculum/${curriculumId}/subjects/${subjectId}`, {
      method: "DELETE",
    });
  },

  listExamSessions(filters: {
    classId?: string;
    termId?: string;
    academicYearId?: string;
    status?: string;
    includeDeleted?: boolean;
  } = {}) {
    const qs = new URLSearchParams();
    if (filters.classId) qs.set("class_id", filters.classId);
    if (filters.termId) qs.set("term_id", filters.termId);
    if (filters.academicYearId) qs.set("academic_year_id", filters.academicYearId);
    if (filters.status) qs.set("status", filters.status);
    if (filters.includeDeleted) qs.set("include_deleted", "true");
    const q = qs.toString();
    return apiClient<OLevelExamSession[]>(`${BASE}/exam-sessions${q ? `?${q}` : ""}`).then(
      (r) => r.data,
    );
  },

  createExamSession(body: {
    curriculumId: string;
    classId: string;
    termId: string;
    academicYearId: string;
    categoryId: string;
    title: string;
    maxMarks?: number;
  }) {
    return apiClient<OLevelExamSession>(`${BASE}/exam-sessions`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  openExamSession(id: string) {
    return apiClient<OLevelExamSession>(`${BASE}/exam-sessions/${id}/open`, {
      method: "PATCH",
    }).then((r) => r.data);
  },

  closeExamSession(id: string) {
    return apiClient<OLevelExamSession>(`${BASE}/exam-sessions/${id}/close`, {
      method: "PATCH",
    }).then((r) => r.data);
  },

  patchExamSession(id: string, body: { title?: string; maxMarks?: number }) {
    return apiClient<OLevelExamSession>(`${BASE}/exam-sessions/${id}`, {
      method: "PATCH",
      body,
    }).then((r) => r.data);
  },

  softDeleteExamSession(id: string) {
    return apiClient<{ ok: boolean; hard: boolean; session?: OLevelExamSession }>(
      `${BASE}/exam-sessions/${id}`,
      { method: "DELETE" },
    ).then((r) => r.data);
  },

  hardDeleteExamSession(id: string) {
    return apiClient<{ ok: boolean; hard: boolean }>(
      `${BASE}/exam-sessions/${id}?hard=true`,
      { method: "DELETE" },
    ).then((r) => r.data);
  },

  restoreExamSession(id: string) {
    return apiClient<OLevelExamSession>(`${BASE}/exam-sessions/${id}/restore`, {
      method: "POST",
    }).then((r) => r.data);
  },

  listSubmissions(examSessionId: string) {
    return apiClient<OLevelMarkSubmission[]>(
      `${BASE}/marks/${examSessionId}/submissions`,
    ).then((r) => r.data);
  },

  listEnrollments(filters: { classId?: string; academicYearId?: string } = {}) {
    const qs = new URLSearchParams();
    if (filters.classId) qs.set("class_id", filters.classId);
    if (filters.academicYearId) qs.set("academic_year_id", filters.academicYearId);
    const q = qs.toString();
    return apiClient<StudentCurriculumEnrollment[]>(
      `${BASE}/enrollments${q ? `?${q}` : ""}`,
    ).then((r) => r.data);
  },

  bulkEnroll(body: {
    classId: string;
    academicYearId: string;
    curriculumId: string;
  }) {
    return apiClient<{ enrolled: number; skipped: number }>(`${BASE}/enrollments/bulk`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  registerSubjects(
    enrollmentId: string,
    subjects: Array<{ subjectId: string; subjectRole: string }>,
  ) {
    return apiClient<{ registered: number }>(
      `${BASE}/enrollments/${enrollmentId}/subjects`,
      { method: "POST", body: { subjects } },
    ).then((r) => r.data);
  },

  bulkRegisterSubjects(body: {
    classId: string;
    academicYearId: string;
    subjects: Array<{ subjectId: string; subjectRole: string }>;
    enrollmentIds?: string[];
  }) {
    return apiClient<{ enrolled: number }>(`${BASE}/enrollments/bulk-subjects`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  listEnrollmentSubjects(enrollmentId: string) {
    return apiClient<StudentSubjectRegistration[]>(
      `${BASE}/enrollments/${enrollmentId}/subjects`,
    ).then((r) => r.data);
  },

  getMarkGrid(examSessionId: string, subjectId: string) {
    return apiClient<OLevelMarkGridResponse>(
      `${BASE}/marks?exam_session_id=${examSessionId}&subject_id=${subjectId}`,
    ).then((r) => r.data);
  },

  saveMarks(body: BulkMarkPayload) {
    return apiClient<{ saved: number }>(`${BASE}/marks/bulk`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  submitMarks(examSessionId: string, subjectId: string) {
    return apiClient(`${BASE}/marks/${examSessionId}/submit`, {
      method: "POST",
      body: { subjectId },
    }).then((r) => r.data);
  },

  unlockMarks(
    examSessionId: string,
    body: { subjectId: string; teacherId: string; reason: string },
  ) {
    return apiClient(`${BASE}/marks/${examSessionId}/unlock`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  gradeClass(body: { classId: string; termId: string; academicYearId: string }) {
    return apiClient<{ calculated: number }>(`${BASE}/grade/class`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  generateClassResults(body: {
    classId: string;
    termId: string;
    academicYearId: string;
    examSessionId?: string;
    assessmentSessionIds?: string[];
  }) {
    return apiClient<{
      calculated: number;
      ranked: number;
      failed?: number;
      errors?: string[];
      selection?: {
        examSessionId: string;
        assessmentSessionIds: string[];
      };
    }>(`${BASE}/grade/generate`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  getGradingSelection(classId: string, termId: string, academicYearId: string) {
    return apiClient<{
      examSessionId: string;
      assessmentSessionIds: string[];
      selectedAt?: string | null;
      selectedBy?: string | null;
    } | null>(
      `${BASE}/results/grading-selection?class_id=${classId}&term_id=${termId}&academic_year_id=${academicYearId}`,
    ).then((r) => r.data);
  },

  gradeStudent(
    enrollmentId: string,
    body: { termId: string; academicYearId: string },
  ) {
    return apiClient(`${BASE}/grade/student/${enrollmentId}`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  rankings(body: { classId: string; termId: string; academicYearId: string }) {
    return apiClient<{ updated: number }>(`${BASE}/results/rankings`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  classResults(classId: string, termId: string, academicYearId: string) {
    return apiClient<OLevelClassResultsResponse>(
      `${BASE}/results/class?class_id=${classId}&term_id=${termId}&academic_year_id=${academicYearId}`,
    ).then((r) => r.data);
  },

  studentResults(enrollmentId: string) {
    return apiClient(`${BASE}/results/student/${enrollmentId}`).then((r) => r.data);
  },

  saveComments(body: {
    enrollmentId: string;
    termId: string;
    academicYearId: string;
    classTeacherComment?: string;
    headTeacherComment?: string;
  }) {
    return apiClient(`${BASE}/results/comments`, { method: "POST", body }).then(
      (r) => r.data,
    );
  },

  saveCommentsBulk(body: {
    enrollmentIds: string[];
    termId: string;
    academicYearId: string;
    classTeacherComment?: string;
    headTeacherComment?: string;
    approve?: boolean;
  }) {
    return apiClient<{ saved: number; approved: number }>(
      `${BASE}/results/comments/bulk`,
      { method: "POST", body },
    ).then((r) => r.data);
  },

  approve(body: { classId: string; termId: string; academicYearId: string }) {
    return apiClient<{ approved: number }>(`${BASE}/results/approve`, {
      method: "POST",
      body,
    }).then((r) => r.data);
  },

  teacherAssignments() {
    return apiClient<TeacherOLevelAssignment[]>(`${BASE}/teacher/assignments`).then(
      (r) => r.data,
    );
  },

  downloadStudentReport(enrollmentId: string, termId: string, academicYearId: string) {
    return blobRequest(
      `${BASE}/report-cards/student?enrollment_id=${enrollmentId}&term_id=${termId}&academic_year_id=${academicYearId}`,
    );
  },

  downloadClassReports(body: {
    classId: string;
    termId: string;
    academicYearId: string;
  }) {
    return blobRequest(`${BASE}/report-cards/class`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
