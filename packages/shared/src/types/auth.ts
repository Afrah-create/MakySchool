import type { MakySchoolRole } from "./rbac";

export interface SuperAdmin {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface SuperAdminJwtPayload {
  sub: string;
  email: string;
  name?: string;
  role?: "super_admin";
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface TenantJwtPayload {
  sub: string;
  schoolId: string;
  schoolSlug: string;
  role: MakySchoolRole;
  email?: string;
  name?: string;
  mustChangePassword?: boolean;
  setupCompleted?: boolean;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: MakySchoolRole;
  school_id: string;
}
