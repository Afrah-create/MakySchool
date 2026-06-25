export {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  CLIENT_APP_HEADER,
} from "./auth";
export type { ClientAppKind } from "./auth";

export const TENANT_HEADERS = {
  SCHOOL_SLUG: "x-school-slug",
  SCHOOL_ID: "x-school-id",
} as const;

export const USER_ROLES = {
  ADMIN: "admin",
  HEAD_TEACHER: "head_teacher",
  TEACHER: "teacher",
  BURSAR: "bursar",
  LEARNER: "learner",
} as const;

export const DEFAULT_ROOT_DOMAIN = "school.makylegacy.com";

export const UGANDA_TERMS = ["Term 1", "Term 2", "Term 3"] as const;

export const SUBSCRIPTION_FEE_UGX = 300_000;

export {
  DEFAULT_PAGE_LIMIT,
  SCHOOL_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./school";

export {
  ACADEMIC_ERROR_CODES,
  type AcademicErrorCode,
} from "./academic";

export {
  PRIMARY_CLASS_LEVELS,
  SECONDARY_CLASS_LEVELS,
  formatClassLabel,
  getLevelSectionsForSchoolType,
  getLevelsForSchoolType,
  groupClassesByLevel,
  isLevelAllowedForSchoolType,
  sortClasses,
} from "./classes";

export { subscriptionsEnabled } from "./features";

export { ROLE_HOME, CAN, can, isMakySchoolRole, MAKY_SCHOOL_ROLES, type PermissionAction, type MakySchoolRole } from "./rbac";

export {
  ACCESS_TOKEN_TTL_MINUTES,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
  SESSION_WARNING_AT_MS,
  SESSION_IDLE_CHECK_INTERVAL_MS,
  SESSION_AUTH_PING_INTERVAL_MS,
  SESSION_ACTIVITY_THROTTLE_MS,
  TENANT_SESSION_CHANNEL,
  PLATFORM_SESSION_CHANNEL,
  type SessionBroadcastMessage,
  type SessionLogoutReason,
} from "./session";
