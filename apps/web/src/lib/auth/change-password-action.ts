"use server";

import { TENANT_HEADERS } from "@makyschool/shared/constants";
import { cookies, headers } from "next/headers";
import { getServerApiBaseUrl } from "@/lib/api/base-url";
import { applyUpstreamSetCookies } from "@/lib/api/forward-set-cookies";
import { getServerTenantContext } from "@/lib/tenant/server";

export type ChangePasswordResult = {
  error?: string;
  redirect?: string;
  schoolSlug?: string;
};

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);
  const requestHeaders = new Headers({ "Content-Type": "application/json" });

  if (tenant?.schoolSlug) {
    requestHeaders.set(TENANT_HEADERS.SCHOOL_SLUG, tenant.schoolSlug);
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  const upstream = await fetch(`${getServerApiBaseUrl()}/auth/change-password`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({ currentPassword, newPassword }),
    cache: "no-store",
  });

  const raw = await upstream.text();

  if (!raw.trim()) {
    return {
      error: upstream.ok
        ? "Empty response from the auth server."
        : `Password change failed (${upstream.status}). Is the API running on port 4000?`,
    };
  }

  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return { error: "Auth server returned a web page instead of JSON." };
  }

  let payload: { data?: { redirect: string; schoolSlug: string }; error?: string; code?: string };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return { error: "Unexpected response from the auth server." };
  }

  applyUpstreamSetCookies(upstream, cookieStore);

  if (!upstream.ok) {
    return { error: payload.error ?? "Failed to change password" };
  }

  return {
    redirect: payload.data?.redirect ?? "/dashboard",
    schoolSlug: payload.data?.schoolSlug,
  };
}
