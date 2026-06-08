/** Roles supported in Week 1 scope */
export type UserRole = "admin" | "head_teacher" | "teacher" | "learner";

export type SchoolType = "primary" | "secondary" | "both";

export type SubscriptionStatus = "active" | "expired" | "pending";

/** Injected by middleware / reverse proxy on every tenant request */
export interface TenantContext {
  schoolSlug: string;
  schoolId?: string;
}

export interface School {
  id: string;
  slug: string;
  name: string;
  type: SchoolType;
  subdomain: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}
