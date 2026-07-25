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
  /** How many stored grades already exist (frozen if the scale changes). */
  existingGradeCount?: number;
}

export interface ALevelGradeCell {
  rawScore: number | null;
  grade: string | null;
  points: number | null;
}

export type ALevelExamStatus = 'draft' | 'open' | 'closed';

export interface ALevelExamType {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ALevelExam {
  id: string;
  classId: string;
  termId: string;
  academicYearId: string;
  examTypeId: string;
  examTypeName: string | null;
  examTypeCode: string | null;
  name: string;
  status: ALevelExamStatus;
  isOpen: boolean;
  isLocked: boolean;
  openedAt: string | null;
  openedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  notes: string | null;
  className: string | null;
  termName: string | null;
  createdAt: string | null;
  /** Marking progress (list endpoint). */
  studentCount?: number;
  applicableCells?: number;
  gradedCells?: number;
}

export interface ALevelGradesGrid {
  students: ALevelEnrollment[];
  subjects: ALevelSubject[];
  /** Keyed by `${studentId}:${subjectId}` */
  grades: Record<string, ALevelGradeCell>;
  examId: string;
  examName: string;
  examStatus: ALevelExamStatus;
  isLocked: boolean;
  isOpen: boolean;
  /** When set (teachers), only these subject IDs may be edited. */
  editableSubjectIds: string[] | null;
  /** Teacher may save marks (exam open + not yet submitted). */
  canEdit: boolean;
  readOnly: boolean;
  /** Teacher has submitted marks for this exam. */
  isSubmitted: boolean;
  submittedAt: string | null;
  /** Admin/HT: teachers who have submitted. */
  submissions: ALevelMarkSubmission[];
}

export interface ALevelMarkSubmission {
  teacherId: string;
  teacherName: string;
  submittedAt: string | null;
  unlockedAt: string | null;
  unlockedByName: string | null;
  isLocked: boolean;
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

export interface ALevelSubjectStat {
  subjectId: string;
  subjectName: string;
  code: string;
  sat: number;
  passRate: number;
  averagePoints: number;
}

export interface ALevelResultsSummary {
  studentCount: number;
  averagePoints: number;
  certificateEligible: number;
  certificateEligiblePercent: number;
  threePrincipalPasses: number;
  twoPrincipalPasses: number;
  subjectStats: ALevelSubjectStat[];
}

export interface ALevelResultsResponse {
  results: ALevelStudentResult[];
  subjects: ALevelSubject[];
  summary: ALevelResultsSummary;
  examId: string;
  examName?: string;
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
  examId: string;
  entries: Array<{
    studentId: string;
    subjectId: string;
    rawScore: number | null;
  }>;
}

export interface SaveALevelGradesResult {
  saved: number;
  cleared: number;
  skipped: number;
}

export interface UpdateALevelEnrollmentPayload {
  combinationId?: string | null;
  subsidiarySubjectId?: string | null;
  isActive?: boolean;
}

export interface BulkUpdateALevelEnrollmentsPayload {
  enrollmentIds: string[];
  combinationId?: string | null;
  subsidiarySubjectId?: string | null;
  isActive?: boolean;
}

export interface ALevelReportCard {
  schoolName: string | null;
  logoUrl: string | null;
  stampUrl: string | null;
  studentId: string;
  studentName: string;
  studentInitials: string;
  photoUrl: string | null;
  learnerId: string;
  className: string | null;
  combinationName: string;
  examId: string;
  examName: string;
  examTypeName: string | null;
  termId: string;
  termName: string;
  academicYearId: string;
  subjects: Array<
    ALevelResultSubject & { code: string; descriptor: string }
  >;
  best_principal_points: number;
  gp_points: number;
  subsidiary_points: number;
  total_points: number;
  principal_pass_count: number;
  result_code: string;
  position: number | null;
  classSize: number | null;
  classTeacherComment: string | null;
  headTeacherComment: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
}

export interface ALevelApprovedReportSummary {
  examId: string;
  examName: string;
  examTypeName: string | null;
  examTypeCode: string | null;
  termId: string;
  termName: string;
  academicYearId: string;
  academicYearLabel: string | null;
  approvedAt: string | null;
  total_points: number;
  principal_pass_count: number;
  result_code: string;
  hasClassTeacherComment: boolean;
  hasHeadTeacherComment: boolean;
}

export interface CreateALevelExamTypePayload {
  name: string;
  code: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateALevelExamTypePayload {
  name?: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateALevelExamPayload {
  classId: string;
  termId: string;
  academicYearId: string;
  examTypeId: string;
  name?: string | null;
  notes?: string | null;
  openNow?: boolean;
}

export interface UpdateALevelExamPayload {
  name?: string;
  notes?: string | null;
}

export interface ALevelExamFilters {
  classId?: string;
  termId?: string;
  academicYearId?: string;
  status?: ALevelExamStatus | '';
}
