import { USER_ROLES } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";

export type Portal = "school-admin" | "teacher" | "learner";

export const SCHOOL_ADMIN_ROLES: readonly UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.HEAD_TEACHER,
];

export const TEACHER_ROLES: readonly UserRole[] = [USER_ROLES.TEACHER];

export const LEARNER_ROLES: readonly UserRole[] = [USER_ROLES.LEARNER];

export function portalForRole(role: UserRole): Portal {
  if (SCHOOL_ADMIN_ROLES.includes(role)) {
    return "school-admin";
  }
  if (TEACHER_ROLES.includes(role)) {
    return "teacher";
  }
  return "learner";
}

export function homePathForPortal(portal: Portal): string {
  switch (portal) {
    case "school-admin":
      return "/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "learner":
      return "/learner/dashboard";
  }
}

export function roleHasPortalAccess(role: UserRole, portal: Portal): boolean {
  return portalForRole(role) === portal;
}

export function isSchoolAdminRole(role: UserRole): boolean {
  return SCHOOL_ADMIN_ROLES.includes(role);
}
