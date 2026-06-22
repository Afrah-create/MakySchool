import type { MakySchoolRole } from "../types/rbac";

export { MAKY_SCHOOL_ROLES, isMakySchoolRole } from "../types/rbac";
export type { MakySchoolRole };

export const ROLE_HOME: Record<MakySchoolRole, string> = {
  admin: "/dashboard",
  head_teacher: "/dashboard",
  teacher: "/teacher/dashboard",
  learner: "/learner/dashboard",
};

export const CAN = {
  manageSchool: ["admin"],
  manageBilling: ["admin"],
  manageUsers: ["admin"],
  viewAllClasses: ["admin", "head_teacher"],
  viewAllStaff: ["admin", "head_teacher"],
  viewAllResults: ["admin", "head_teacher"],
  manageClasses: ["admin", "head_teacher"],
  enterMarks: ["admin", "head_teacher", "teacher"],
  viewOwnClasses: ["admin", "head_teacher", "teacher"],
  viewFinance: ["admin"],
} as const satisfies Record<string, MakySchoolRole[]>;

export type PermissionAction = keyof typeof CAN;

export function can(role: MakySchoolRole, action: PermissionAction): boolean {
  const allowed = CAN[action] as readonly MakySchoolRole[];
  return allowed.includes(role);
}
