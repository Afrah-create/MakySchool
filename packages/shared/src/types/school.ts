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
  school: SchoolRecord | null;
  profileComplete: boolean;
  academicYearComplete: boolean;
  gradingScaleComplete: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  stats?: SchoolStats;
}
