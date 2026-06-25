import type { SessionLogoutReason } from "@makyschool/shared/constants";
import { broadcastLogout } from "@/lib/auth/session-broadcast";

let loggingOut = false;

export async function performLogout(reason: SessionLogoutReason = "manual", loginPath = "/login") {
  if (loggingOut || typeof window === "undefined") {
    return;
  }
  loggingOut = true;

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "x-makyschool-client-app": "platform" },
    }).catch(() => {});
  } catch {
    // best-effort
  }

  sessionStorage.clear();

  broadcastLogout(reason);

  window.location.replace(`${loginPath}?reason=${reason}`);
}

export function isAuthExemptPath(path: string) {
  const normalized = path.toLowerCase();
  return (
    normalized.includes("/auth/login") ||
    normalized.includes("/auth/logout") ||
    normalized.includes("/auth/refresh") ||
    normalized.endsWith("/auth/me") ||
    normalized.includes("/auth/me?")
  );
}
