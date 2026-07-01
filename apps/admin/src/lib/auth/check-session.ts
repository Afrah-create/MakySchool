import { PLATFORM_SESSION_CHANNEL } from "@makyschool/shared/constants";
import { isActivityIdleExpired, readStoredActivity } from "@makyschool/shared/session";
import { performLogout } from "@/lib/auth/logout";
import { resolveClientApiUrl } from "@/lib/api/base-url";

async function refreshSession() {
  const response = await fetch(resolveClientApiUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers: { "x-makyschool-client-app": "platform" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Session refresh failed");
  }
}

export async function checkAuthOrRedirect() {
  if (typeof window === "undefined") {
    return;
  }

  const lastActivity = readStoredActivity(PLATFORM_SESSION_CHANNEL);
  if (isActivityIdleExpired(lastActivity)) {
    await performLogout("idle");
    return;
  }

  try {
    await refreshSession();
  } catch {
    await performLogout("expired");
  }
}
