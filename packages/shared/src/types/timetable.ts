export type TimetableTrack = "secular" | "theology" | "both";

export interface TimetablePeriod {
  id: string;
  class_id: string;
  term_id: string | null;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  teacher_id: string;
  track: TimetableTrack;
  subject_name: string;
  teacher_name: string;
  class_name?: string;
}

export interface TimetableGrid {
  classId: string | null;
  termId: string | null;
  periods: TimetablePeriod[];
}

export interface TimetablePeriodInput {
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string;
  track: TimetableTrack;
}

export interface TimetableBulkReplacePayload {
  classId: string;
  termId: string | null;
  periods: TimetablePeriodInput[];
}

export interface SchoolPeriodTemplate {
  periodNumber: number;
  label: string | null;
  startTime: string;
  endTime: string;
}

export interface SchoolPeriodTemplatesPayload {
  periods: SchoolPeriodTemplate[];
}

export interface ClassTimetableBulkInput {
  classId: string;
  periods: TimetablePeriodInput[];
}

export interface TimetableMultiBulkReplacePayload {
  termId: string | null;
  classes: ClassTimetableBulkInput[];
}

export interface AnalyticsMetricAvailable<T> {
  available: true;
}

export interface AnalyticsMetricUnavailable {
  available: false;
  reason: string;
  items?: never[];
}

export interface StudentClassCountsMetric {
  available: true;
  classes: number;
  students: number;
}

export interface FeeCollectionRateMetric {
  available: true;
  ratePercent: number;
  amountOwed: number;
  amountPaid: number;
}

export interface TeacherMarksSubmissionMetric {
  available: true;
  byStatus: Record<string, number>;
}

export interface StubAnalyticsMetric {
  available: false;
  reason: string;
  items: [];
}

export interface AnalyticsOverview {
  termId: string | null;
  studentClassCounts: StudentClassCountsMetric;
  feeCollectionRate: FeeCollectionRateMetric;
  teacherMarksSubmission: TeacherMarksSubmissionMetric;
  bestStudents: StubAnalyticsMetric;
  weakSubjects: StubAnalyticsMetric;
  attendanceTrends: StubAnalyticsMetric;
  competencyAchievement: StubAnalyticsMetric;
}

export interface SuperadminAnalytics {
  schools: {
    total: number;
    byStatus: Record<string, number>;
    active: number;
    setup: number;
  };
  revenue: {
    year: number;
    totalThisYear: number;
    byTerm: Record<string, number>;
  };
}
