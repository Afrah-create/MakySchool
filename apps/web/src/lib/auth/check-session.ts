import { TENANT_SESSION_CHANNEL } from "@makyschool/shared/constants";
import { isActivityIdleExpired, readStoredActivity } from "@makyschool/shared/session";
import { performLogout } from "@/lib/auth/logout";
import { resolveClientApiUrl } from "@/lib/api/base-url";
import { readStoredSchoolSlug } from "@/lib/auth/session";

async function refreshSession() {
  const schoolSlug = readStoredSchoolSlug() ?? document.body.dataset.schoolSlug;
  const headers: HeadersInit = {
    "x-makyschool-client-app": "tenant",
  };
  if (schoolSlug) {
    headers["x-school-slug"] = schoolSlug;
  }

  const response = await fetch(resolveClientApiUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers,
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

  const lastActivity = readStoredActivity(TENANT_SESSION_CHANNEL);
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
