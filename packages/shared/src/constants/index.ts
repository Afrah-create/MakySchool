export {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
} from "./auth";

export const TENANT_HEADERS = {
  SCHOOL_SLUG: "x-school-slug",
  SCHOOL_ID: "x-school-id",
} as const;

export const USER_ROLES = {
  ADMIN: "admin",
  HEAD_TEACHER: "head_teacher",
  TEACHER: "teacher",
  LEARNER: "learner",
} as const;

export const DEFAULT_ROOT_DOMAIN = "makyschool.com";

export const UGANDA_TERMS = ["Term 1", "Term 2", "Term 3"] as const;

export const SUBSCRIPTION_FEE_UGX = 300_000;

export {
  DEFAULT_PAGE_LIMIT,
  SCHOOL_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./school";

export {
  PRIMARY_CLASS_LEVELS,
  SECONDARY_CLASS_LEVELS,
  getLevelsForSchoolType,
} from "./classes";
