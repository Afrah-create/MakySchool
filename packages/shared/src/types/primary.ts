export type PrimarySubjectType = "core" | "elective" | "thematic";

export type PrimaryCaType = "assignment" | "test" | "project" | "quiz" | "practical";

export type PrimaryExamType =
  | "mid_term"
  | "end_of_term"
  | "mock"
  | "internal"
  | "ple_mock";

export type PleGrade = "D1" | "D2" | "C3" | "C4" | "C5" | "C6" | "P7" | "P8" | "F9";

export interface PrimaryGradeBand {
  id?: string;
  grade: string;
  label: string;
  minPercent: number;
  maxPercent: number;
  remarks?: string | null;
  displayOrder: number;
}

export interface PrimarySetup {
  id: string;
  name: string;
  caWeight: number;
  examWeight: number;
  allowThematicInP4: boolean;
  /** ple_points = D1–F9 aggregate (4–36); percent = average % */
  aggregateMode: "ple_points" | "percent";
  isActive: boolean;
  gradeScale: PrimaryGradeBand[];
}

export interface PrimarySubject {
  id: string;
  name: string;
  code: string;
  subjectType: PrimarySubjectType;
  appliesFrom: string;
  appliesTo: string;
  religionType?: "CRE" | "IRE" | null;
  maxMark: number;
  isPleSubject: boolean;
  isActive: boolean;
  displayOrder: number;
  schoolSubjectId?: string | null;
}

export type PrimaryExamStatus = "draft" | "open" | "closed";

export interface PrimaryExamTypeOption {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PrimaryExam {
  id: string;
  schoolId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  examTypeId: string;
  examTypeName?: string | null;
  examTypeCode?: string | null;
  name: string;
  status: PrimaryExamStatus;
  isOpen: boolean;
  isLocked: boolean;
  className?: string | null;
  classLevel?: string | null;
  termName?: string | null;
  notes?: string | null;
  openedAt?: string | null;
  openedByName?: string | null;
  closedAt?: string | null;
  closedByName?: string | null;
  createdAt?: string | null;
  deletedAt?: string | null;
  deleted?: boolean;
  hasMarks?: boolean;
  subjectIds?: string[];
  subjects?: Array<{
    id: string;
    name: string;
    code: string;
    maxMark: number;
    isPleSubject?: boolean;
  }>;
}

export interface CreatePrimaryExamPayload {
  classId: string;
  termId: string;
  examTypeId: string;
  name?: string | null;
  notes?: string | null;
  openNow?: boolean;
  subjectIds?: string[];
}

export interface UpdatePrimaryExamPayload {
  name?: string;
  notes?: string | null;
  subjectIds?: string[];
}

export interface PrimaryExamFilters {
  classId?: string;
  termId?: string;
  status?: PrimaryExamStatus | "";
  includeDeleted?: boolean;
}

export interface CreatePrimaryExamTypePayload {
  name: string;
  code: string;
  sortOrder?: number;
}

export interface UpdatePrimaryExamTypePayload {
  name?: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface PrimaryExamGradesGrid {
  exam: PrimaryExam;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
    maxMark: number;
    isPleSubject?: boolean;
  }>;
  students: Array<{
    studentId: string;
    fullName: string;
    learnerId: string | null;
    scores: Record<
      string,
      {
        score: number | null;
        maxScore: number;
        finalPercent: number | null;
        grade: string | null;
        gradeLabel: string | null;
      }
    >;
  }>;
  canEdit: boolean;
  submitted: boolean;
  submissions: Array<{
    teacherId: string;
    teacherName: string;
    submittedAt: string;
  }>;
}

export interface PrimaryTheme {
  id: string;
  name: string;
  appliesFrom: string;
  appliesTo: string;
  displayOrder: number;
}

export interface PrimaryClassOption {
  id: string;
  level: string;
  stream: string | null;
  name: string;
}

export interface PrimaryRosterStudent {
  id: string;
  fullName: string;
  learnerId: string | null;
}

export interface PrimaryOverview {
  configured: boolean;
  primaryStudents: number;
  submittedSubjectSlots: number;
  reportsGenerated: number;
  p7Students: number;
}

export interface PrimaryClassResults {
  classId: string;
  className: string;
  termId: string;
  termName: string | null;
  examId?: string | null;
  isLowerPrimary: boolean;
  students: Array<{
    studentId: string;
    studentName: string;
    learnerId: string | null;
    averagePercent?: number | null;
    overallGrade?: string | null;
    overallGradeLabel?: string | null;
    aggregate?: number | null;
    division?: string | null;
    examId?: string | null;
    classPosition?: number | null;
    totalStudents?: number | null;
    subjectGrades?: Record<
      string,
      { grade: string | null; finalPercent: number | null; gradePoints?: number | null }
    >;
    classTeacherComment?: string | null;
    headTeacherComment?: string | null;
    approvedAt?: string | null;
    reportGenerated?: boolean;
    thematicCount?: number;
    averageLevel?: number | null;
    isLowerPrimary: boolean;
  }>;
}

export interface PrimaryReportCard {
  studentId?: string;
  studentName?: string;
  learnerId?: string | null;
  className?: string | null;
  photoUrl?: string | null;
  studentInitials?: string;
  student: {
    id: string;
    fullName: string;
    learnerId: string | null;
    className: string | null;
    classId: string | null;
    photoUrl: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
  };
  termId: string;
  termName: string;
  academicYear: string | number | null;
  examId: string | null;
  examName: string | null;
  examTypeName: string | null;
  isLowerPrimary: boolean;
  subjectResults?: Array<{
    subjectName: string;
    subjectCode: string;
    isPleSubject: boolean;
    caPercentage: number | null;
    examScore: number | null;
    examPercentage: number | null;
    finalPercent: number | null;
    grade: string | null;
    gradeLabel: string | null;
    gradePoints: number | null;
    position: number | null;
    teacherComment: string | null;
  }>;
  totals: {
    totalMarks: number | null;
    totalPossible: number | null;
    averagePercent: number | null;
    overallGrade: string | null;
    overallGradeLabel: string | null;
    aggregate: number | null;
    division: string | null;
    classPosition: number | null;
    totalStudents: number | null;
    attendanceDays: number | null;
    presentDays: number | null;
    attendancePercent: number | null;
  } | null;
  classTeacherComment: string | null;
  headTeacherComment: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  reportGenerated?: boolean;
}

export interface PrimaryApprovedReportSummary {
  examId: string;
  examName: string;
  examTypeName: string | null;
  termId: string;
  termName: string;
  academicYear: string | number | null;
  academicYearLabel: string | null;
  approvedAt: string | null;
  aggregate: number | null;
  division: string | null;
  averagePercent: number | null;
  overallGrade: string | null;
  classPosition: number | null;
  totalStudents: number | null;
  hasClassTeacherComment: boolean;
  hasHeadTeacherComment: boolean;
}

export interface PleResult {
  id: string;
  studentId: string;
  studentName?: string | null;
  learnerId?: string | null;
  academicYearId: string;
  indexNumber?: string | null;
  englishGrade: string | null;
  mathGrade: string | null;
  scienceGrade: string | null;
  sstGrade: string | null;
  aggregate: number | null;
  division: string | null;
}
