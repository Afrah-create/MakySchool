export type ALevelSubjectType = 'principal' | 'subsidiary';

export type ALevelCombinationCategory =
  | 'science'
  | 'arts'
  | 'business'
  | 'technical';

export interface ALevelSubject {
  id: string;
  /** The base subject in the school catalogue (school_subjects). */
  schoolSubjectId: string;
  name: string;
  code: string;
  subjectType: ALevelSubjectType;
  isGp: boolean;
  isActive: boolean;
}

export interface ALevelCombination {
  id: string;
  name: string;
  label: string | null;
  category: ALevelCombinationCategory;
  isActive: boolean;
  subjects: ALevelSubject[];
}

export interface ALevelEnrollment {
  id: string;
  studentId: string;
  studentName: string;
  learnerId: string;
  combinationId: string;
  combinationName: string;
  academicYearId: string;
  subsidiarySubjectId: string | null;
  subsidiarySubjectName: string | null;
  classId: string | null;
  className: string | null;
  isActive: boolean;
}

/** An S5/S6 class — the only levels that take subject combinations. */
export interface ALevelClass {
  id: string;
  level: string;
  stream: string | null;
}

export interface ALevelTermOption {
  id: string;
  name: string;
  isCurrent: boolean;
  academicYearId: string;
  year: number;
  yearIsCurrent: boolean;
}

export interface ALevelGradeBand {
  minScore: number;
  grade: string;
  points: number;
}

export interface ALevelGradingScale {
  bands: ALevelGradeBand[];
  subsidiaryPassThreshold: number;
}

export interface ALevelGradeCell {
  rawScore: number | null;
  grade: string | null;
  points: number | null;
}

export interface ALevelGradesGrid {
  students: ALevelEnrollment[];
  subjects: ALevelSubject[];
  /** Keyed by `${studentId}:${subjectId}` */
  grades: Record<string, ALevelGradeCell>;
}

export interface ALevelResultSubject {
  subjectId: string;
  subjectName: string;
  subjectType: ALevelSubjectType;
  isGp: boolean;
  rawScore: number | null;
  grade: string | null;
  points: number | null;
}

export interface ALevelStudentResult {
  studentId: string;
  studentName: string;
  learnerId: string;
  combinationName: string;
  className: string | null;
  subjects: ALevelResultSubject[];
  best_principal_points: number;
  gp_points: number;
  subsidiary_points: number;
  total_points: number;
  principal_pass_count: number;
  result_code: string;
  position: number;
}

export interface ALevelResultsResponse {
  results: ALevelStudentResult[];
  subjects: ALevelSubject[];
}

export interface CreateALevelSubjectPayload {
  /** Link an existing catalogue subject… */
  schoolSubjectId?: string | null;
  /** …or create a new catalogue subject with this name. */
  name?: string | null;
  code: string;
  subjectType: ALevelSubjectType;
  isGp: boolean;
  isActive: boolean;
}

export interface UpdateALevelSubjectPayload {
  code: string;
  subjectType: ALevelSubjectType;
  isGp: boolean;
  isActive: boolean;
}

export interface CreateALevelCombinationPayload {
  name: string;
  label?: string | null;
  category: ALevelCombinationCategory;
  subjectIds: string[];
}

export interface CreateALevelEnrollmentPayload {
  studentId: string;
  combinationId: string;
  academicYearId: string;
  subsidiarySubjectId?: string | null;
  classId?: string | null;
}

export interface BulkALevelEnrollmentPayload {
  studentIds: string[];
  combinationId: string;
  academicYearId: string;
  classId: string;
  subsidiarySubjectId?: string | null;
}

export interface BulkALevelEnrollmentResult {
  enrolled: number;
  /** Already enrolled for this academic year. */
  skipped: number;
  /** Not found in this school, or not active. */
  invalid: number;
}

export interface ALevelEnrollmentFilters {
  academicYearId?: string;
  classId?: string;
  combinationId?: string;
  category?: ALevelCombinationCategory | '';
  search?: string;
}

export interface SaveALevelGradesPayload {
  termId: string;
  academicYearId: string;
  classId: string;
  entries: Array<{
    studentId: string;
    subjectId: string;
    rawScore: number | null;
  }>;
}
