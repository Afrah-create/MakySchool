import { cookies } from "next/headers";
import { getApiUrl } from "@/lib/tenant/server";

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { schoolSlug?: string } = {},
) {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);

  if (init.schoolSlug) {
    headers.set("x-school-slug", init.schoolSlug);
  }

  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json()) as { data?: T; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload.data as T;
}
