import { cookies } from "next/headers";
import { getServerApiBaseUrl } from "@/lib/api/base-url";

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);

  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const apiBase = getServerApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const response = await fetch(`${apiBase}${normalizedPath}`, {
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
