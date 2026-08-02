/** O-Level NLSC CBC types — camelCase API shapes. */

export type OLevelGradeScale = {
  id: string;
  curriculumId: string;
  grade: string;
  label: string;
  points: number;
  minPercent: number;
  maxPercent: number;
  isPass: boolean;
  displayOrder: number;
};

export type AssessmentCategory = {
  id: string;
  curriculumId: string;
  name: string;
  code: string;
  weightPercent: number;
  displayOrder: number;
  isActive?: boolean;
};

export type SelectionRule = {
  id: string;
  curriculumId: string;
  appliesToLevels: string[];
  minSubjects: number;
  maxSubjects: number;
  compulsoryCount: number;
  optionalMin: number;
  optionalMax: number;
  optionalToCountInResult: number;
};

export type PromotionRules = {
  id: string;
  curriculumId: string;
  minGradeToPass: string;
  maxFailedCompulsory: number;
  maxFailedOptional: number;
  attendanceMinPercent?: number | null;
};

export type CurriculumReportRules = {
  id: string;
  curriculumId: string;
  showGrades: boolean;
  showPercentages: boolean;
  showPoints: boolean;
  showRemarks: boolean;
  showClassPosition: boolean;
  showSubjectPosition: boolean;
  showDivisionRanking: boolean;
  showResultCode: boolean;
  showTeacherComment: boolean;
  showHeadTeacherComment: boolean;
  showAttendance: boolean;
  reportTitle: string;
  customFooterText?: string | null;
};

export type OLevelCurriculum = {
  id: string;
  schoolId: string;
  name: string;
  description?: string | null;
  educationLevel: string;
  academicYearFrom: number;
  academicYearTo?: number | null;
  version?: string;
  isActive: boolean;
  gradeScale?: OLevelGradeScale[];
  assessmentCategories?: AssessmentCategory[];
  selectionRules?: SelectionRule[];
  promotionRules?: PromotionRules | null;
  reportRules?: CurriculumReportRules | null;
};

export type OLevelSubject = {
  id: string;
  schoolId: string;
  schoolSubjectId?: string | null;
  name: string;
  code: string;
  abbreviation?: string | null;
  department?: string | null;
  isActive: boolean;
};

export type CurriculumSubject = OLevelSubject & {
  subjectId: string;
  subjectRole: "compulsory" | "optional" | "co_curricular";
  appliesToLevels: string[];
  displayOrder: number;
};

export type OLevelExamSession = {
  id: string;
  schoolId: string;
  curriculumId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  categoryId: string;
  title: string;
  status: "draft" | "open" | "closed";
  maxMarks: number;
  className?: string;
  classLevel?: string;
  termName?: string;
  categoryName?: string;
  categoryCode?: string;
  categoryWeightPercent?: number;
  openedAt?: string | null;
  closedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleted?: boolean;
  hasMarks?: boolean | null;
};

export type StudentCurriculumEnrollment = {
  id: string;
  schoolId: string;
  studentId: string;
  curriculumId: string;
  classId?: string | null;
  academicYearId: string;
  studentName?: string;
  learnerId?: string | null;
  className?: string | null;
  enrolledAt?: string;
  registeredSubjectCount?: number;
  optionalSubjectCount?: number;
  compulsorySubjectCount?: number;
};

export type OLevelLevelBand = "S1-S2" | "S3-S4";

export const OLEVEL_LEVEL_BANDS: Record<
  OLevelLevelBand,
  { label: string; levels: string[] }
> = {
  "S1-S2": { label: "S1–S2 (lower secondary)", levels: ["S1", "S2"] },
  "S3-S4": { label: "S3–S4 (upper secondary)", levels: ["S3", "S4"] },
};

export type StudentSubjectRegistration = {
  id: string;
  subjectId: string;
  subjectRole: "compulsory" | "optional";
  academicYearId: string;
  status: "active" | "dropped";
  subjectName?: string;
  subjectCode?: string;
};

export type OLevelMarkEntry = {
  studentId: string;
  studentName?: string;
  learnerId?: string | null;
  rawScore: number | null;
  isAbsent: boolean;
  remarks?: string | null;
  enteredAt?: string | null;
};

export type OLevelMarkGridResponse = {
  examSession: OLevelExamSession;
  subjectId: string;
  submissionStatus: "draft" | "submitted" | "unlocked";
  unlockReason?: string | null;
  gradeScale?: OLevelGradeScale[];
  marks: OLevelMarkEntry[];
};

export type OLevelSubjectResult = {
  id: string;
  enrollmentId: string;
  subjectId: string;
  subjectRole: string;
  subjectName?: string;
  subjectCode?: string;
  categoryScores: { [code: string]: number };
  weightedScore: number;
  assessmentPercent?: number | null;
  examPercent?: number | null;
  grade: string;
  gradeLabel?: string | null;
  points: number;
  isPass: boolean;
  countsInResult: boolean;
  subjectPosition?: number | null;
  teacherComment?: string | null;
};

export type OLevelStudentResult = {
  id: string;
  enrollmentId: string;
  academicYearId: string;
  termId: string;
  studentName?: string;
  learnerId?: string | null;
  compulsoryPassed: number;
  compulsoryFailed: number;
  optionalPassed: number;
  optionalFailed: number;
  subjectsCounted: number;
  totalPoints: number;
  averagePercent: number;
  classPosition?: number | null;
  totalStudentsInClass?: number | null;
  isPromoted?: boolean | null;
  promotionReason?: string | null;
  classTeacherComment?: string | null;
  headTeacherComment?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  subjectResults?: OLevelSubjectResult[];
};

export type OLevelClassResultsResponse = {
  classId: string;
  termId: string;
  academicYearId: string;
  students: OLevelStudentResult[];
  summary?: {
    studentCount: number;
    approvedCount: number;
    promotedCount: number;
    averagePercent: number;
    rankedCount: number;
  };
};

export type BulkMarkPayload = {
  examSessionId: string;
  subjectId: string;
  marks: Array<{
    studentId: string;
    rawScore?: number | null;
    isAbsent?: boolean;
    remarks?: string | null;
  }>;
};

export type OLevelOverview = {
  configured: boolean;
  enrolledCount: number;
  subjects: number;
  openSessions: number;
  resultsPendingApproval: number;
};

export type OLevelClassOption = {
  id: string;
  level: string;
  stream: string | null;
  name: string;
};

export type OLevelTermOption = {
  id: string;
  name: string;
  academicYearId: string;
  academicYearName: string;
  isCurrent: boolean;
  yearIsCurrent?: boolean;
  startDate?: string | null;
};

export type TeacherOLevelAssignment = {
  examSessionId: string;
  title: string;
  status: string;
  maxMarks: number;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  academicYearId: string;
  categoryId: string;
  categoryName: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  submissionStatus: string;
  enteredCount: number;
  studentCount: number;
};

export type OLevelMarkSubmission = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  teacherId: string;
  teacherName: string;
  status: string;
  submittedAt?: string | null;
  unlockedAt?: string | null;
  unlockReason?: string | null;
  enteredCount: number;
};
