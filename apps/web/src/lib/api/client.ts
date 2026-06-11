import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { ApiError, ApiResponse } from "@makyschool/shared/types";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  schoolSlug?: string;
  schoolId?: string;
};

function getBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL ?? process.env.API_URL ?? "http://localhost:4000/api";
  }

  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

function resolveSchoolSlug(explicitSlug?: string) {
  if (explicitSlug) {
    return explicitSlug;
  }

  if (typeof document !== "undefined") {
    return document.body.dataset.schoolSlug || undefined;
  }

  return undefined;
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, schoolSlug, schoolId, headers: initHeaders, ...rest } = options;

  const headers = new Headers(initHeaders);
  const resolvedSlug = resolveSchoolSlug(schoolSlug);

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (resolvedSlug) {
    headers.set(TENANT_HEADERS.SCHOOL_SLUG, resolvedSlug);
  }

  if (schoolId) {
    headers.set(TENANT_HEADERS.SCHOOL_ID, schoolId);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...rest,
    credentials: "include",
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiResponse<T> | ApiError;

  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(error.error ?? "Request failed");
  }

  return payload as ApiResponse<T>;
}
