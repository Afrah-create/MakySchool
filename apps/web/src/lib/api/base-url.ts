function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function withApiSuffix(value: string) {
  const normalized = stripTrailingSlash(value);
  if (!normalized) {
    return "/api";
  }
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

/** Normalize an API path to `/auth/login`, `/schools/classes`, etc. (no `/api` prefix). */
export function normalizeApiPath(path: string) {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed.startsWith("/api/") ? trimmed.slice(4) : trimmed;
}

/**
 * Browser/client absolute URL for API requests.
 * Always targets the same-origin `/api/*` proxy unless an absolute remote base is configured.
 */
export function resolveClientApiUrl(path: string) {
  const apiPath = normalizeApiPath(path);
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return `${withApiSuffix(configured)}${apiPath}`;
  }

  if (typeof window !== "undefined") {
    return new URL(`/api${apiPath}`, window.location.origin).href;
  }

  return `/api${apiPath}`;
}

/** @deprecated Use resolveClientApiUrl — kept for server-side callers. */
export function getClientApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return withApiSuffix(configured);
  }
  return "/api";
}

/** Server-side API base — talks directly to Express. */
export function getServerApiBaseUrl() {
  const configured =
    process.env.API_INTERNAL_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  if (configured.startsWith("/")) {
    return withApiSuffix(`http://localhost:3000${configured}`);
  }

  return withApiSuffix(configured);
}
