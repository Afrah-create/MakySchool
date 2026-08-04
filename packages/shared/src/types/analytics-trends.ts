import type { AcademicYearStatus } from "./school";

export interface SchoolAnnualSummaryRow {
  academicYearId: string;
  year: number;
  isCurrent: boolean;
  enrolledStudentCount: number;
  avgAcademicScore: number;
  feeCollectionRate: number;
  feeAmountOwed: number;
  feeAmountPaid: number;
  avgAttendanceRate: number;
  attendanceMarkedCount: number;
  refreshedAt: string | null;
}

export interface ClassTermSummaryRow {
  termId: string;
  academicYearId: string;
  academicYear: number;
  termName: string;
  classId: string;
  classLabel: string;
  level: string;
  stream: string | null;
  studentCount: number;
  marksSubmissionRate: number;
  avgSubjectScore: number;
  feeCollectionRate: number;
  refreshedAt: string | null;
}

export interface DataRetentionSettings {
  hotYears: number;
  warmYears: number;
  archiveAfterYears: number;
  updatedAt?: string | null;
  currentYear?: number | null;
  preview?: Array<{
    id: string;
    year: number;
    isCurrent: boolean;
    status: AcademicYearStatus | null;
    visibility: "hot" | "warm" | "archive";
    termCount?: number;
  }>;
}

export type YearVisibility = "hot" | "warm" | "archive";
