import { CLIENT_APP_HEADER } from "@makyschool/shared/constants";
import type { ApiError, ApiResponse } from "@makyschool/shared/types";
import { normalizeApiPath, resolveClientApiUrl } from "@/lib/api/base-url";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  clientApp?: "platform" | "tenant";
};

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, clientApp = "platform", headers: initHeaders, ...rest } = options;

  const headers = new Headers(initHeaders);
  const normalizedPath = normalizeApiPath(path);
  const requestUrl = resolveClientApiUrl(path);

  headers.set(CLIENT_APP_HEADER, clientApp);

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

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
    throw new Error(`API redirected to ${location}. Expected JSON from ${requestUrl}.`);
  }

  let payload: ApiResponse<T> | ApiError;
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? "Empty API response."
        : `API request failed (${response.status}). Is the backend running?`,
    );
  }

  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(`Received HTML instead of JSON from ${requestUrl}.`);
  }

  try {
    payload = JSON.parse(raw) as ApiResponse<T> | ApiError;
  } catch {
    throw new Error(`Unexpected API response from ${requestUrl}`);
  }

  if (!response.ok) {
    const error = payload as ApiError;
    const requestError = new Error(error.error ?? "Request failed") as Error & {
      code?: string;
      redirectUrl?: string;
    };
    requestError.code = error.code;
    if ("redirectUrl" in error && typeof error.redirectUrl === "string") {
      requestError.redirectUrl = error.redirectUrl;
    }
    throw requestError;
  }

  return payload as ApiResponse<T>;
}
