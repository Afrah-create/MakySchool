import { CLIENT_APP_HEADER, TENANT_HEADERS } from "@makyschool/shared/constants";
import type { ApiError, ApiResponse } from "@makyschool/shared/types";
import { normalizeApiPath, resolveClientApiUrl } from "@/lib/api/base-url";
import { isAuthExemptPath } from "@/lib/auth/logout";
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
  const normalizedPath = normalizeApiPath(path);
  const requestUrl = resolveClientApiUrl(path);

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (resolvedSlug) {
    headers.set(TENANT_HEADERS.SCHOOL_SLUG, resolvedSlug);
  }

  if (schoolId) {
    headers.set(TENANT_HEADERS.SCHOOL_ID, schoolId);
  }

  headers.set(CLIENT_APP_HEADER, "tenant");

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...rest,
      credentials: "include",
      redirect: "manual",
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
      "Unable to connect to the server. Please check your internet connection and try again.",
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      "The server redirected your request unexpectedly. Please refresh and try again.",
    );
  }

  let payload: ApiResponse<T> | ApiError;
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? "The server returned an empty response. Please try again."
        : "Something went wrong. The server could not process your request right now.",
    );
  }

  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      "The server returned an unexpected response. Please refresh the page and try again.",
    );
  }

  try {
    payload = JSON.parse(raw) as ApiResponse<T> | ApiError;
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an unexpected response. Please try again."
        : "Something went wrong. Please check your connection and try again.",
    );
  }

  if (!response.ok) {
    const error = payload as ApiError & { preview?: unknown };
    if (
      response.status === 401 &&
      !isAuthExemptPath(normalizedPath) &&
      typeof window !== "undefined"
    ) {
      void import("@/lib/auth/logout").then(({ performLogout }) => performLogout("expired"));
    }
    const requestError = new Error(error.error ?? "Request failed") as Error & {
      code?: string;
      fields?: Record<string, string>;
      failed?: Array<{ index: number; student_id: string; error: string }>;
      preview?: unknown;
      distance_metres?: number;
      allowed_metres?: number;
    };
    requestError.code = error.code;
    requestError.fields = error.fields;
    requestError.failed = (error as { failed?: typeof requestError.failed }).failed;
    requestError.preview = error.preview;
    requestError.distance_metres = (error as { distance_metres?: number }).distance_metres;
    requestError.allowed_metres = (error as { allowed_metres?: number }).allowed_metres;
    if (error.redirectUrl) {
      (requestError as Error & { redirectUrl?: string }).redirectUrl = error.redirectUrl;
    }
    throw requestError;
  }

  return payload as ApiResponse<T>;
}
