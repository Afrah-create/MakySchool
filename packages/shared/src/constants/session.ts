export const ACCESS_TOKEN_TTL_MINUTES = 20;

export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;
export const SESSION_WARNING_AT_MS = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS;
export const SESSION_IDLE_CHECK_INTERVAL_MS = 10_000;
export const SESSION_AUTH_PING_INTERVAL_MS = 60_000;
export const SESSION_ACTIVITY_THROTTLE_MS = 1000;

export const TENANT_SESSION_CHANNEL = "makyschool-tenant-session";
export const PLATFORM_SESSION_CHANNEL = "makyschool-platform-session";

export type SessionLogoutReason = "manual" | "idle" | "expired";

export type SessionBroadcastMessage =
  | { type: "activity"; at: number }
  | { type: "logout"; reason: SessionLogoutReason };
