import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { ApiError, ApiResponse } from "@makyschool/shared/types";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  schoolSlug?: string;
  schoolId?: string;
};

function getBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL ?? process.env.API_URL ?? "http://localhost:4000";
  }

  return process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, schoolSlug, schoolId, headers: initHeaders, ...rest } = options;

  const headers = new Headers(initHeaders);

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (schoolSlug) {
    headers.set(TENANT_HEADERS.SCHOOL_SLUG, schoolSlug);
  }

  if (schoolId) {
    headers.set(TENANT_HEADERS.SCHOOL_ID, schoolId);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json()) as ApiResponse<T> | ApiError;

  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(error.error ?? "Request failed");
  }

  return payload as ApiResponse<T>;
}
