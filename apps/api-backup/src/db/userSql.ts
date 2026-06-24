/** Shared SQL fragments for legacy + multi-tenant user rows. */
export const USER_DISPLAY_NAME_SQL = "COALESCE(u.name, u.full_name)";
export const USER_ADMIN_ROLE_SQL = "LOWER(u.role) IN ('admin')";
export const USER_TEACHER_ROLE_SQL = "LOWER(u.role) IN ('teacher')";
export const USER_LEARNER_ROLE_SQL = "LOWER(u.role) IN ('learner', 'student')";

export function normalizeUserRole(role: string) {
  const value = role.toLowerCase();
  if (value === "admin") return "admin";
  if (value === "head_teacher") return "head_teacher";
  if (value === "teacher") return "teacher";
  if (value === "bursar") return "bursar";
  if (value === "student") return "learner";
  if (value === "learner") return "learner";
  return value;
}

export function isMakySchoolTenantRole(role: string) {
  return ["admin", "head_teacher", "teacher", "bursar", "learner"].includes(normalizeUserRole(role));
}
