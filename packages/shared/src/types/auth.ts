import type { UserRole } from "./index";

export interface SuperAdmin {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface SuperAdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: "super_admin";
}

export interface TenantJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId: string;
  schoolSlug: string;
}

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string;
}
