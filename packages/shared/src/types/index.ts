export type UserRole = import("./rbac").MakySchoolRole;
export type { MakySchoolRole } from "./rbac";

export type SchoolType = "primary" | "secondary" | "both";

export type SubscriptionStatus = "unpaid" | "active" | "expired";

/** Injected by middleware / reverse proxy on every tenant request */
export interface TenantContext {
  schoolSlug: string;
  schoolId?: string;
}

/** @deprecated Use SchoolRecord from ./school instead */
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
  fields?: Record<string, string>;
  redirectUrl?: string;
  details?: Record<string, string[]>;
}

export * from "./rbac";
export * from "./auth";
export * from "./school";
export * from "./classes";
export * from "./subscription";
export * from "./platform";
