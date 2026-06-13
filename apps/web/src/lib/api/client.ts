import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { ApiError, ApiResponse } from "@makyschool/shared/types";
import { getClientApiBaseUrl } from "@/lib/api/base-url";
import { readStoredSchoolSlug } from "@/lib/auth/session";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  schoolSlug?: string;
  schoolId?: string;
};

function resolveSchoolSlug(explicitSlug?: string) {
  if (explicitSlug) {
    return explicitSlug;
  }

  if (typeof document !== "undefined") {
    return document.body.dataset.schoolSlug || readStoredSchoolSlug() || undefined;
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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (resolvedSlug) {
    headers.set(TENANT_HEADERS.SCHOOL_SLUG, resolvedSlug);
  }

  if (schoolId) {
    headers.set(TENANT_HEADERS.SCHOOL_ID, schoolId);
  }

  let response: Response;

  try {
    response = await fetch(`${getClientApiBaseUrl()}${normalizedPath}`, {
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
  } catch {
    throw new Error(
      "Cannot reach the API. Start the backend with: npm run dev:api (or npm run dev:all from the repo root).",
    );
  }

  let payload: ApiResponse<T> | ApiError;

  try {
    payload = (await response.json()) as ApiResponse<T> | ApiError;
  } catch {
    throw new Error(
      response.ok
        ? "Unexpected API response"
        : `API request failed (${response.status}). Is the backend running on port 4000?`,
    );
  }

  if (!response.ok) {
    const error = payload as ApiError;
    const requestError = new Error(error.error ?? "Request failed") as Error & {
      code?: string;
    };
    requestError.code = error.code;
    throw requestError;
  }

  return payload as ApiResponse<T>;
}
