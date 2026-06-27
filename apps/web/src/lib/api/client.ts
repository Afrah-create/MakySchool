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
      "Cannot reach the API. Start the backend with: npm run dev:api (or npm run dev:all from the repo root).",
    );
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "unknown";
    throw new Error(
      `API redirected to ${location}. Expected JSON from ${requestUrl}.`,
    );
  }

  let payload: ApiResponse<T> | ApiError;
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? "Empty API response. The server returned success without a body."
        : `API request failed (${response.status}). Is the backend running on port 4000?`,
    );
  }

  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      `Received a web page instead of JSON from ${requestUrl}. The API route may be missing — restart the dev server and confirm POST hits /api${normalizedPath}.`,
    );
  }

  try {
    payload = JSON.parse(raw) as ApiResponse<T> | ApiError;
  } catch {
    throw new Error(
      response.ok
        ? `Unexpected API response from ${requestUrl}`
        : `API request failed (${response.status}). Is the backend running on port 4000?`,
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
    };
    requestError.code = error.code;
    requestError.fields = error.fields;
    requestError.failed = (error as { failed?: typeof requestError.failed }).failed;
    requestError.preview = error.preview;
    if (error.redirectUrl) {
      (requestError as Error & { redirectUrl?: string }).redirectUrl = error.redirectUrl;
    }
    throw requestError;
  }

  return payload as ApiResponse<T>;
}
