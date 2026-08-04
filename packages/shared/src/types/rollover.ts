import type { PromotionAction, RolloverTrack } from "../constants/promotion";

export type StudentLifecycleStatus =
  | "active"
  | "inactive"
  | "withdrawn"
  | "graduated"
  | "transferred";

export type RolloverSessionStatus = "in_progress" | "completed" | "cancelled" | "failed";

export interface PromotionPreviewRow {
  studentId: string;
  learnerId: string;
  fullName: string;
  currentClassId: string;
  currentClassLabel: string;
  currentLevel: string;
  currentStream: string | null;
  proposedAction: PromotionAction;
  proposedClassId: string | null;
  proposedClassLabel: string | null;
  reason: string;
  requiresManualEnrollment: boolean;
  /** Admin override; null means accept proposedAction. */
  overrideAction?: PromotionAction | null;
}

export interface PromotionPreviewSummary {
  track: RolloverTrack;
  fromAcademicYearId: string;
  fromYear: number;
  total: number;
  promote: number;
  graduate: number;
  noPath: number;
  missingTargetClass: number;
}

export interface PromotionPreviewResponse {
  summary: PromotionPreviewSummary;
  students: PromotionPreviewRow[];
}

export interface StudentDecisionDraft {
  action: Extract<PromotionAction, "promote" | "repeat" | "graduate">;
  targetClassId?: string | null;
}

export interface RolloverDraft {
  newYear?: {
    year: number;
    terms: Array<{ name: string; startDate: string | null; endDate: string | null }>;
  };
  studentDecisions?: Record<string, StudentDecisionDraft>;
  teacherAssignmentIds?: string[];
  feePercentIncrease?: number;
  feeStructureIds?: string[];
  timetable?: {
    include: boolean;
    sourceTermId: string | null;
  };
}

export interface RolloverSession {
  id: string;
  track: RolloverTrack;
  status: RolloverSessionStatus;
  currentStep: number;
  fromAcademicYearId: string;
  toAcademicYearId: string | null;
  draft: RolloverDraft;
  idempotencyKey: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface RolloverSessionSummary {
  id: string;
  track: RolloverTrack;
  status: RolloverSessionStatus;
  currentStep: number;
  fromAcademicYearId: string;
  toAcademicYearId: string | null;
  updatedAt: string;
}

export interface RolloverExecuteResult {
  sessionId: string;
  status: "completed";
  track?: RolloverTrack;
  toAcademicYearId: string | null;
  toYear?: number;
  counts: Record<string, number>;
  summary: string;
  idempotentReplay: boolean;
  postRolloverChecklist?: string[];
}

export interface TeacherAssignmentPreviewRow {
  assignmentId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string | null;
  subjectName: string | null;
  fromClassId: string;
  fromClassLabel: string;
  toClassId: string | null;
  toClassLabel: string | null;
  mappable: boolean;
  reason: string;
  include: boolean;
}

export interface FeeStructurePreviewRow {
  structureId: string;
  classId: string;
  classLabel: string;
  termName: string;
  amount: number;
  description: string | null;
  include: boolean;
  items: Array<{ itemId: string; name: string; amount: number }>;
}
