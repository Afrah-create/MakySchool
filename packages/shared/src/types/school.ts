import type { SchoolType, SubscriptionStatus } from "./index";

export type SchoolStatus = "setup" | "active" | "suspended";

export interface SchoolRecord {
  id: string;
  slug: string;
  name: string | null;
  logo_url: string | null;
  stamp_url: string | null;
  email: string | null;
  phone: string | null;
  emails?: string[];
  phones?: string[];
  address: string | null;
  school_type: SchoolType | null;
  status: SchoolStatus;
  subscription_status: SubscriptionStatus;
  subscription_term: string | null;
  subscription_year: number | null;
  schoolpay_code: string | null;
  created_at: string;
}

export interface SchoolListItem extends Pick<
  SchoolRecord,
  "id" | "name" | "slug" | "status" | "subscription_status" | "school_type" | "created_at"
> {
  admin_email: string;
}

export interface SchoolCounts {
  classes: number;
  teachers: number;
  students: number;
}

export interface SchoolStats {
  total_schools: number;
  active_schools: number;
  setup_schools: number;
  revenue_current_term: number;
}

export interface SetupStatusResponse {
  profile: boolean;
  academic_year: boolean;
  grading_scale: boolean;
  completed: boolean;
  school?: SchoolRecord | null;
}

export type LearnerIdMode = "sequential" | "random";

export interface StudentIdSettings {
  prefix: string | null;
  suffixLength: number;
  mode: LearnerIdMode;
}

export interface GradingBandSettings {
  id?: string;
  label: string;
  minScore: number;
  maxScore: number;
  description: string | null;
}

export interface TermSettings {
  id?: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent?: boolean;
  academicYearId?: string | null;
}

export type AcademicYearStatus = "draft" | "active" | "closed";

export interface AcademicYearSettings {
  id: string | null;
  year: number | null;
  status?: AcademicYearStatus;
  terms: TermSettings[];
}

export interface AcademicYearSummary {
  id: string;
  year: number;
  isCurrent: boolean;
  status: AcademicYearStatus | null;
  termCount?: number;
  createdAt?: string | null;
  terms?: TermSettings[];
}

export interface SchoolSettingsResponse {
  profile: SchoolRecord & {
    learner_id_prefix?: string | null;
    learner_id_suffix_length?: number;
    learner_id_mode?: LearnerIdMode;
    setup_completed_at?: string | null;
  };
  academic_year: AcademicYearSettings;
  /** All years for the school (newest first). */
  academic_years?: AcademicYearSummary[];
  grading_scale: { bands: GradingBandSettings[] };
  student_ids: StudentIdSettings;
}

export interface ImportPreviewDuplicate {
  row: number;
  type: "in_file" | "existing";
  matched_row?: number;
  fingerprint: string;
  message: string;
}

export interface ImportPreviewResponse {
  job_id: string | null;
  total_rows: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  can_confirm: boolean;
  errors: ImportRowError[];
  duplicates: ImportPreviewDuplicate[];
  sample_valid_rows: Array<Record<string, unknown>>;
}

export interface ImportRowError {
  row: number;
  field: string;
  code?: string;
  message: string;
}

/** Canonical paginated list envelope for new/updated list endpoints. */
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  stats?: SchoolStats;
}
