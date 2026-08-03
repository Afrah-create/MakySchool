import { apiClient } from "./client";
import type {
  PrimaryClassOption,
  PrimaryClassResults,
  PrimaryExam,
  PrimaryExamGradesGrid,
  PrimaryExamTypeOption,
  PrimaryOverview,
  PrimaryReportCard,
  PrimaryRosterStudent,
  PrimarySetup,
  PrimaryStrand,
  PrimarySubject,
  PrimaryTheme,
  PrimaryThematicSitting,
  PleResult,
  PrimaryCaType,
  PrimaryExamType,
} from "@makyschool/shared";

const BASE = "/api/schools/primary";

export const primaryApi = {
  overview(termId?: string) {
    const qs = termId ? `?term_id=${termId}` : "";
    return apiClient<PrimaryOverview>(`${BASE}/overview${qs}`).then((r) => r.data);
  },

  getSetup() {
    return apiClient<PrimarySetup | null>(`${BASE}/setup`).then((r) => r.data);
  },

  ensureSetup(body: {
    caWeight?: number;
    examWeight?: number;
    allowThematicInP4?: boolean;
  } = {}) {
    return apiClient<PrimarySetup>(`${BASE}/setup`, {
      method: "POST",
      body: {
        ca_weight: body.caWeight ?? 30,
        exam_weight: body.examWeight ?? 70,
        allow_thematic_in_p4: body.allowThematicInP4 ?? false,
      },
    }).then((r) => r.data);
  },

  patchSetup(body: {
    caWeight?: number;
    examWeight?: number;
    allowThematicInP4?: boolean;
    aggregateMode?: "ple_points" | "percent";
    gradeScale?: Array<{
      grade: string;
      label: string;
      minPercent: number;
      maxPercent: number;
      remarks?: string | null;
      displayOrder?: number;
    }>;
  }) {
    return apiClient<PrimarySetup>(`${BASE}/setup`, {
      method: "PATCH",
      body: {
        ca_weight: body.caWeight,
        exam_weight: body.examWeight,
        allow_thematic_in_p4: body.allowThematicInP4,
        aggregate_mode: body.aggregateMode,
        grade_scale: body.gradeScale,
      },
    }).then((r) => r.data);
  },

  listClasses() {
    return apiClient<PrimaryClassOption[]>(`${BASE}/classes`).then((r) => r.data);
  },

  roster(classId: string) {
    return apiClient<PrimaryRosterStudent[]>(`${BASE}/classes/${classId}/roster`).then(
      (r) => r.data,
    );
  },

  listSubjects(classLevel?: string) {
    const qs = classLevel ? `?class_level=${classLevel}` : "";
    return apiClient<PrimarySubject[]>(`${BASE}/subjects${qs}`).then((r) => r.data);
  },

  themes(classLevel?: string, includeInactive = false) {
    const q = new URLSearchParams();
    if (classLevel) q.set("class_level", classLevel);
    if (includeInactive) q.set("include_inactive", "true");
    const qs = q.toString() ? `?${q}` : "";
    return apiClient<{
      themes: PrimaryTheme[];
      strands: string[];
      strandItems?: PrimaryStrand[];
    }>(`${BASE}/themes${qs}`).then((r) => r.data);
  },

  createTheme(body: {
    name: string;
    appliesFrom?: string;
    appliesTo?: string;
    displayOrder?: number;
  }) {
    return apiClient<PrimaryTheme>(`${BASE}/themes`, {
      method: "POST",
      body: {
        name: body.name,
        applies_from: body.appliesFrom ?? "P1",
        applies_to: body.appliesTo ?? "P3",
        display_order: body.displayOrder ?? 0,
      },
    }).then((r) => r.data);
  },

  updateTheme(
    id: string,
    body: {
      name?: string;
      appliesFrom?: string;
      appliesTo?: string;
      displayOrder?: number;
      isActive?: boolean;
    },
  ) {
    return apiClient<PrimaryTheme>(`${BASE}/themes/${id}`, {
      method: "PATCH",
      body: {
        name: body.name,
        applies_from: body.appliesFrom,
        applies_to: body.appliesTo,
        display_order: body.displayOrder,
        is_active: body.isActive,
      },
    }).then((r) => r.data);
  },

  deleteTheme(id: string, hard = false) {
    const qs = hard ? "?hard=true" : "";
    return apiClient<{ ok: boolean }>(`${BASE}/themes/${id}${qs}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  listStrands(includeInactive = false) {
    const qs = includeInactive ? "?include_inactive=true" : "";
    return apiClient<PrimaryStrand[]>(`${BASE}/strands${qs}`).then((r) => r.data);
  },

  createStrand(body: { name: string; displayOrder?: number }) {
    return apiClient<PrimaryStrand>(`${BASE}/strands`, {
      method: "POST",
      body: { name: body.name, display_order: body.displayOrder ?? 0 },
    }).then((r) => r.data);
  },

  updateStrand(
    id: string,
    body: { name?: string; displayOrder?: number; isActive?: boolean },
  ) {
    return apiClient<PrimaryStrand>(`${BASE}/strands/${id}`, {
      method: "PATCH",
      body: {
        name: body.name,
        display_order: body.displayOrder,
        is_active: body.isActive,
      },
    }).then((r) => r.data);
  },

  deleteStrand(id: string, hard = false) {
    const qs = hard ? "?hard=true" : "";
    return apiClient<{ ok: boolean }>(`${BASE}/strands/${id}${qs}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  linkClass(body: {
    classId: string;
    subjectId: string;
    teacherId?: string | null;
  }) {
    return apiClient(`${BASE}/subjects/link-class`, {
      method: "POST",
      body: {
        class_id: body.classId,
        subject_id: body.subjectId,
        teacher_id: body.teacherId ?? null,
      },
    }).then((r) => r.data);
  },

  listCa(params: { classId: string; subjectId: string; termId: string }) {
    const q = new URLSearchParams({
      class_id: params.classId,
      subject_id: params.subjectId,
      term_id: params.termId,
    });
    return apiClient<unknown[]>(`${BASE}/marks/ca?${q}`).then((r) => r.data);
  },

  bulkCa(body: {
    classId: string;
    subjectId: string;
    caTitle: string;
    caType: PrimaryCaType;
    maxScore: number;
    termId: string;
    marks: Array<{ studentId: string; score: number | null }>;
  }) {
    return apiClient(`${BASE}/marks/ca/bulk`, {
      method: "POST",
      body: {
        class_id: body.classId,
        subject_id: body.subjectId,
        ca_title: body.caTitle,
        ca_type: body.caType,
        max_score: body.maxScore,
        term_id: body.termId,
        marks: body.marks.map((m) => ({
          student_id: m.studentId,
          score: m.score,
        })),
      },
    }).then((r) => r.data);
  },

  listExamMarks(params: {
    classId: string;
    subjectId: string;
    termId: string;
    examType?: string;
  }) {
    const q = new URLSearchParams({
      class_id: params.classId,
      subject_id: params.subjectId,
      term_id: params.termId,
    });
    if (params.examType) q.set("exam_type", params.examType);
    return apiClient<unknown[]>(`${BASE}/marks/exams?${q}`).then((r) => r.data);
  },

  bulkExams(body: {
    classId: string;
    subjectId: string;
    examType: PrimaryExamType;
    maxScore: number;
    termId: string;
    marks: Array<{ studentId: string; score: number | null }>;
  }) {
    return apiClient(`${BASE}/marks/exams/bulk`, {
      method: "POST",
      body: {
        class_id: body.classId,
        subject_id: body.subjectId,
        exam_type: body.examType,
        max_score: body.maxScore,
        term_id: body.termId,
        marks: body.marks.map((m) => ({
          student_id: m.studentId,
          score: m.score,
        })),
      },
    }).then((r) => r.data);
  },

  submitExams(body: {
    classId: string;
    subjectId: string;
    termId: string;
    examType?: PrimaryExamType;
  }) {
    return apiClient<{
      submitted: number;
      missingScores: string[];
      missingCount: number;
    }>(`${BASE}/marks/exams/submit`, {
      method: "POST",
      body: {
        class_id: body.classId,
        subject_id: body.subjectId,
        term_id: body.termId,
        exam_type: body.examType ?? "end_of_term",
      },
    }).then((r) => r.data);
  },

  unlockExams(body: {
    classId: string;
    subjectId: string;
    termId: string;
    examType?: PrimaryExamType;
  }) {
    return apiClient(`${BASE}/marks/exams/unlock`, {
      method: "POST",
      body: {
        class_id: body.classId,
        subject_id: body.subjectId,
        term_id: body.termId,
        exam_type: body.examType ?? "end_of_term",
      },
    }).then((r) => r.data);
  },

  listThematic(params: { classId: string; termId: string; sittingId?: string }) {
    const q = new URLSearchParams({
      class_id: params.classId,
      term_id: params.termId,
    });
    if (params.sittingId) q.set("sitting_id", params.sittingId);
    return apiClient<
      Array<{
        id: string;
        studentId: string;
        themeId: string;
        strand: string;
        level: number;
        teacherComment?: string | null;
        submitted: boolean;
        sittingId?: string | null;
      }>
    >(`${BASE}/marks/thematic?${q}`).then((r) => r.data);
  },

  bulkThematic(body: {
    classId: string;
    themeId: string;
    strand: string;
    termId: string;
    sittingId?: string;
    assessments: Array<{
      studentId: string;
      level: number;
      teacherComment?: string | null;
    }>;
  }) {
    return apiClient(`${BASE}/marks/thematic/bulk`, {
      method: "POST",
      body: {
        class_id: body.classId,
        theme_id: body.themeId,
        strand: body.strand,
        term_id: body.termId,
        sitting_id: body.sittingId ?? null,
        assessments: body.assessments.map((a) => ({
          student_id: a.studentId,
          level: a.level,
          teacher_comment: a.teacherComment ?? null,
        })),
      },
    }).then((r) => r.data);
  },

  bulkThematicSheet(body: {
    classId: string;
    termId: string;
    sittingId: string;
    assessments: Array<{
      studentId: string;
      themeId: string;
      strand: string;
      level: number;
      teacherComment?: string | null;
    }>;
  }) {
    return apiClient<{ saved: number }>(`${BASE}/marks/thematic/sheet`, {
      method: "POST",
      body: {
        class_id: body.classId,
        term_id: body.termId,
        sitting_id: body.sittingId,
        assessments: body.assessments.map((a) => ({
          student_id: a.studentId,
          theme_id: a.themeId,
          strand: a.strand,
          level: a.level,
          teacher_comment: a.teacherComment ?? null,
        })),
      },
    }).then((r) => r.data);
  },

  submitThematic(sittingId: string) {
    return apiClient<{ submitted: number }>(
      `${BASE}/marks/thematic/submit?sitting_id=${sittingId}`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  unlockThematic(sittingId: string) {
    return apiClient<{ unlocked: number }>(
      `${BASE}/marks/thematic/unlock?sitting_id=${sittingId}`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  classResults(classId: string, termId: string, examId?: string, sittingId?: string) {
    const q = new URLSearchParams({ term_id: termId });
    if (examId) q.set("exam_id", examId);
    if (sittingId) q.set("sitting_id", sittingId);
    return apiClient<PrimaryClassResults>(
      `${BASE}/results/class/${classId}?${q.toString()}`,
    ).then((r) => r.data);
  },

  studentResult(
    studentId: string,
    termId: string,
    examId?: string,
    sittingId?: string,
  ) {
    const q = new URLSearchParams({ term_id: termId });
    if (examId) q.set("exam_id", examId);
    if (sittingId) q.set("sitting_id", sittingId);
    return apiClient<PrimaryReportCard>(
      `${BASE}/results/student/${studentId}?${q.toString()}`,
    ).then((r) => r.data);
  },

  getReportCard(studentId: string, opts: { examId?: string; sittingId?: string }) {
    const q = new URLSearchParams();
    if (opts.examId) q.set("exam_id", opts.examId);
    if (opts.sittingId) q.set("sitting_id", opts.sittingId);
    return apiClient<PrimaryReportCard>(
      `${BASE}/report-card/${studentId}?${q.toString()}`,
    ).then((r) => r.data);
  },

  saveReportComment(
    studentId: string,
    opts: { examId?: string; sittingId?: string },
    payload: {
      classTeacherComment?: string | null;
      headTeacherComment?: string | null;
      approve?: boolean;
    },
  ) {
    const q = new URLSearchParams();
    if (opts.examId) q.set("exam_id", opts.examId);
    if (opts.sittingId) q.set("sitting_id", opts.sittingId);
    return apiClient<{ ok: boolean; approved: boolean }>(
      `${BASE}/report-card/${studentId}/comment?${q.toString()}`,
      { method: "POST", body: payload },
    ).then((r) => r.data);
  },

  bulkSaveReportComments(payload: {
    examId?: string;
    sittingId?: string;
    studentIds: string[];
    classTeacherComment?: string | null;
    headTeacherComment?: string | null;
    approve?: boolean;
  }) {
    return apiClient<{
      saved: number;
      skippedApproved: number;
      skippedNotEnrolled: number;
    }>(`${BASE}/report-cards/comments/bulk`, {
      method: "POST",
      body: payload,
    }).then((r) => r.data);
  },

  refreshPositions(classId: string, termId: string) {
    return apiClient(`${BASE}/results/positions`, {
      method: "POST",
      body: { class_id: classId, term_id: termId },
    }).then((r) => r.data);
  },

  listPle(academicYearId: string) {
    return apiClient<PleResult[]>(
      `${BASE}/ple?academic_year_id=${academicYearId}`,
    ).then((r) => r.data);
  },

  upsertPle(body: {
    studentId: string;
    academicYearId: string;
    indexNumber?: string | null;
    englishGrade: string;
    mathGrade: string;
    scienceGrade: string;
    sstGrade: string;
  }) {
    return apiClient<PleResult>(`${BASE}/ple`, {
      method: "POST",
      body: {
        student_id: body.studentId,
        academic_year_id: body.academicYearId,
        index_number: body.indexNumber ?? null,
        english_grade: body.englishGrade,
        math_grade: body.mathGrade,
        science_grade: body.scienceGrade,
        sst_grade: body.sstGrade,
      },
    }).then((r) => r.data);
  },

  pleAnalytics(academicYearId: string) {
    return apiClient(`${BASE}/ple/analytics?academic_year_id=${academicYearId}`).then(
      (r) => r.data,
    );
  },

  installDefaultSubjects() {
    return apiClient<{
      created: number;
      classLinksAdded: number;
      subjects: PrimarySubject[];
    }>(`${BASE}/subjects/install-defaults`, { method: "POST" }).then((r) => r.data);
  },

  createSubject(body: {
    name: string;
    code: string;
    subjectType?: string;
    appliesFrom?: string;
    appliesTo?: string;
    maxMark?: number;
    isPleSubject?: boolean;
  }) {
    return apiClient<PrimarySubject>(`${BASE}/subjects`, {
      method: "POST",
      body: {
        name: body.name,
        code: body.code,
        subject_type: body.subjectType ?? "core",
        applies_from: body.appliesFrom ?? "P4",
        applies_to: body.appliesTo ?? "P7",
        max_mark: body.maxMark ?? 100,
        is_ple_subject: body.isPleSubject ?? false,
      },
    }).then((r) => r.data);
  },

  listExamTypes(activeOnly = false) {
    const qs = activeOnly ? "?active_only=true" : "";
    return apiClient<PrimaryExamTypeOption[]>(`${BASE}/exam-types${qs}`).then(
      (r) => r.data,
    );
  },

  createExamType(body: { name: string; code: string; sortOrder?: number }) {
    return apiClient<PrimaryExamTypeOption>(`${BASE}/exam-types`, {
      method: "POST",
      body: {
        name: body.name,
        code: body.code,
        sort_order: body.sortOrder ?? 0,
      },
    }).then((r) => r.data);
  },

  updateExamType(
    id: string,
    body: {
      name?: string;
      code?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) payload.name = body.name;
    if (body.code !== undefined) payload.code = body.code;
    if (body.sortOrder !== undefined) payload.sort_order = body.sortOrder;
    if (body.isActive !== undefined) payload.is_active = body.isActive;
    return apiClient<PrimaryExamTypeOption>(`${BASE}/exam-types/${id}`, {
      method: "PATCH",
      body: payload,
    }).then((r) => r.data);
  },

  deleteExamType(id: string) {
    return apiClient<{ ok: boolean }>(`${BASE}/exam-types/${id}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  listExams(params?: {
    classId?: string;
    termId?: string;
    status?: string;
    includeDeleted?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.classId) q.set("class_id", params.classId);
    if (params?.termId) q.set("term_id", params.termId);
    if (params?.status) q.set("status", params.status);
    if (params?.includeDeleted) q.set("include_deleted", "true");
    const qs = q.toString() ? `?${q}` : "";
    return apiClient<PrimaryExam[]>(`${BASE}/exams${qs}`).then((r) => r.data);
  },

  createExam(body: {
    classId: string;
    termId: string;
    examTypeId: string;
    name?: string | null;
    notes?: string | null;
    openNow?: boolean;
    subjectIds?: string[];
  }) {
    return apiClient<PrimaryExam>(`${BASE}/exams`, {
      method: "POST",
      body: {
        class_id: body.classId,
        term_id: body.termId,
        exam_type_id: body.examTypeId,
        name: body.name,
        notes: body.notes,
        open_now: body.openNow ?? false,
        subject_ids: body.subjectIds,
      },
    }).then((r) => r.data);
  },

  updateExam(
    examId: string,
    body: {
      name?: string;
      notes?: string | null;
      subjectIds?: string[];
    },
  ) {
    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) payload.name = body.name;
    if (body.notes !== undefined) payload.notes = body.notes;
    if (body.subjectIds !== undefined) payload.subject_ids = body.subjectIds;
    return apiClient<PrimaryExam>(`${BASE}/exams/${examId}`, {
      method: "PATCH",
      body: payload,
    }).then((r) => r.data);
  },

  openExam(examId: string) {
    return apiClient<PrimaryExam>(`${BASE}/exams/${examId}/open`, {
      method: "POST",
    }).then((r) => r.data);
  },

  closeExam(examId: string) {
    return apiClient<PrimaryExam>(`${BASE}/exams/${examId}/close`, {
      method: "POST",
    }).then((r) => r.data);
  },

  softDeleteExam(examId: string) {
    return apiClient<{ ok: boolean; hard: boolean; exam?: PrimaryExam }>(
      `${BASE}/exams/${examId}`,
      { method: "DELETE" },
    ).then((r) => r.data);
  },

  hardDeleteExam(examId: string) {
    return apiClient<{ ok: boolean; hard: boolean }>(
      `${BASE}/exams/${examId}?hard=true`,
      { method: "DELETE" },
    ).then((r) => r.data);
  },

  restoreExam(examId: string) {
    return apiClient<PrimaryExam>(`${BASE}/exams/${examId}/restore`, {
      method: "POST",
    }).then((r) => r.data);
  },

  examGrades(examId: string) {
    return apiClient<PrimaryExamGradesGrid>(`${BASE}/exams/${examId}/grades`).then(
      (r) => r.data,
    );
  },

  bulkExamGrades(
    examId: string,
    marks: Array<{
      studentId: string;
      subjectId: string;
      score: number | null;
      maxScore?: number;
    }>,
  ) {
    return apiClient(`${BASE}/exams/${examId}/grades/bulk`, {
      method: "POST",
      body: {
        marks: marks.map((m) => ({
          student_id: m.studentId,
          subject_id: m.subjectId,
          score: m.score,
          max_score: m.maxScore ?? 100,
        })),
      },
    }).then((r) => r.data);
  },

  submitExam(examId: string) {
    return apiClient(`${BASE}/exams/${examId}/submit`, { method: "POST" }).then(
      (r) => r.data,
    );
  },

  unlockExamSubmission(examId: string, teacherId: string) {
    return apiClient(
      `${BASE}/exams/${examId}/submissions/${teacherId}/unlock`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  generateReportCards(params: {
    examId?: string;
    sittingId?: string;
    classId?: string;
    termId?: string;
    studentId?: string;
  }) {
    const q = new URLSearchParams();
    if (params.examId) q.set("exam_id", params.examId);
    if (params.sittingId) q.set("sitting_id", params.sittingId);
    if (params.classId) q.set("class_id", params.classId);
    if (params.termId) q.set("term_id", params.termId);
    if (params.studentId) q.set("student_id", params.studentId);
    return import("@/lib/api/downloadBinary").then(({ downloadBinaryFile }) =>
      downloadBinaryFile(`${BASE}/report-cards/generate?${q.toString()}`, {
        method: "POST",
        fallbackFilename: params.studentId
          ? "primary-report.pdf"
          : "primary-report-cards.zip",
      }),
    );
  },

  listSittings(params?: {
    classId?: string;
    termId?: string;
    status?: string;
    includeDeleted?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.classId) q.set("class_id", params.classId);
    if (params?.termId) q.set("term_id", params.termId);
    if (params?.status) q.set("status", params.status);
    if (params?.includeDeleted) q.set("include_deleted", "true");
    const qs = q.toString() ? `?${q}` : "";
    return apiClient<PrimaryThematicSitting[]>(`${BASE}/sittings${qs}`).then(
      (r) => r.data,
    );
  },

  createSitting(body: {
    classId: string;
    termId: string;
    examTypeId: string;
    name?: string | null;
    notes?: string | null;
    openNow?: boolean;
  }) {
    return apiClient<PrimaryThematicSitting>(`${BASE}/sittings`, {
      method: "POST",
      body: {
        class_id: body.classId,
        term_id: body.termId,
        exam_type_id: body.examTypeId,
        name: body.name,
        notes: body.notes,
        open_now: body.openNow ?? false,
      },
    }).then((r) => r.data);
  },

  updateSitting(
    sittingId: string,
    body: { name?: string; notes?: string | null },
  ) {
    return apiClient<PrimaryThematicSitting>(`${BASE}/sittings/${sittingId}`, {
      method: "PATCH",
      body,
    }).then((r) => r.data);
  },

  openSitting(sittingId: string) {
    return apiClient<PrimaryThematicSitting>(
      `${BASE}/sittings/${sittingId}/open`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  closeSitting(sittingId: string) {
    return apiClient<PrimaryThematicSitting>(
      `${BASE}/sittings/${sittingId}/close`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  softDeleteSitting(sittingId: string) {
    return apiClient<PrimaryThematicSitting>(`${BASE}/sittings/${sittingId}`, {
      method: "DELETE",
    }).then((r) => r.data);
  },

  hardDeleteSitting(sittingId: string) {
    return apiClient<{ ok: boolean }>(
      `${BASE}/sittings/${sittingId}?hard=true`,
      { method: "DELETE" },
    ).then((r) => r.data);
  },

  restoreSitting(sittingId: string) {
    return apiClient<PrimaryThematicSitting>(
      `${BASE}/sittings/${sittingId}/restore`,
      { method: "POST" },
    ).then((r) => r.data);
  },
};
