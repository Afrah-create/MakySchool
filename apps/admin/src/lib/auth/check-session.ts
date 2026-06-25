import { performLogout } from "@/lib/auth/logout";
import { resolveClientApiUrl } from "@/lib/api/base-url";

type SessionCheckResponse = {
  valid: boolean;
  expiresAt?: number;
};

export async function checkAuthOrRedirect() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const response = await fetch(`${resolveClientApiUrl("/auth/me")}?sessionOnly=true`, {
      method: "GET",
      credentials: "include",
      headers: { "x-makyschool-client-app": "platform" },
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
