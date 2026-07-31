import { apiClient } from "./client";
import type {
  PrimaryClassOption,
  PrimaryClassResults,
  PrimaryOverview,
  PrimaryRosterStudent,
  PrimarySetup,
  PrimarySubject,
  PrimaryTheme,
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

  themes(classLevel?: string) {
    const qs = classLevel ? `?class_level=${classLevel}` : "";
    return apiClient<{ themes: PrimaryTheme[]; strands: string[] }>(
      `${BASE}/themes${qs}`,
    ).then((r) => r.data);
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

  listExams(params: {
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

  listThematic(params: { classId: string; termId: string }) {
    const q = new URLSearchParams({
      class_id: params.classId,
      term_id: params.termId,
    });
    return apiClient<unknown[]>(`${BASE}/marks/thematic?${q}`).then((r) => r.data);
  },

  bulkThematic(body: {
    classId: string;
    themeId: string;
    strand: string;
    termId: string;
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
        assessments: body.assessments.map((a) => ({
          student_id: a.studentId,
          level: a.level,
          teacher_comment: a.teacherComment ?? null,
        })),
      },
    }).then((r) => r.data);
  },

  classResults(classId: string, termId: string) {
    return apiClient<PrimaryClassResults>(
      `${BASE}/results/class/${classId}?term_id=${termId}`,
    ).then((r) => r.data);
  },

  studentResult(studentId: string, termId: string) {
    return apiClient(`${BASE}/results/student/${studentId}?term_id=${termId}`).then(
      (r) => r.data,
    );
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

  generateReportCards(params: {
    classId: string;
    termId: string;
    studentId?: string;
  }) {
    const q = new URLSearchParams({
      class_id: params.classId,
      term_id: params.termId,
    });
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
};
