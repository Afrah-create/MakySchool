import { performLogout } from "@/lib/auth/logout";
import { resolveClientApiUrl } from "@/lib/api/base-url";
import { readStoredSchoolSlug } from "@/lib/auth/session";

type SessionCheckResponse = {
  valid: boolean;
  expiresAt?: number;
};

export async function checkAuthOrRedirect() {
  if (typeof window === "undefined") {
    return;
  }

  const schoolSlug = readStoredSchoolSlug() ?? document.body.dataset.schoolSlug;
  const headers: HeadersInit = {
    "x-makyschool-client-app": "tenant",
  };
  if (schoolSlug) {
    headers["x-school-slug"] = schoolSlug;
  }

  try {
    const response = await fetch(`${resolveClientApiUrl("/auth/me")}?sessionOnly=true`, {
      method: "GET",
      credentials: "include",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      await performLogout("expired");
      return;
    }

    const payload = (await response.json()) as { data?: SessionCheckResponse };
    if (!payload.data?.valid) {
      await performLogout("expired");
    }
  } catch {
    await performLogout("expired");
  }
}
