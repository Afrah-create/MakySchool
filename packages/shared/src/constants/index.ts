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
