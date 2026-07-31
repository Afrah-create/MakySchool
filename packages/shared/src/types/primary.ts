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
  isLowerPrimary: boolean;
  students: Array<{
    studentId: string;
    studentName: string;
    learnerId: string | null;
    averagePercent?: number | null;
    overallGrade?: string | null;
    overallGradeLabel?: string | null;
    classPosition?: number | null;
    totalStudents?: number | null;
    subjectGrades?: Record<string, { grade: string | null; finalPercent: number | null }>;
    thematicCount?: number;
    averageLevel?: number | null;
    isLowerPrimary: boolean;
  }>;
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
