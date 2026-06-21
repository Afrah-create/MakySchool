export const SUPERADMIN_ACCESS_COOKIE = "superadmin_access_token";
export const SUPERADMIN_REFRESH_COOKIE = "superadmin_refresh_token";

export const TENANT_ACCESS_COOKIE = "tenant_access_token";
export const TENANT_REFRESH_COOKIE = "tenant_refresh_token";

/** Identifies which frontend initiated auth: platform admin or tenant web */
export const CLIENT_APP_HEADER = "x-makyschool-client-app";

export type ClientAppKind = "platform" | "tenant";
