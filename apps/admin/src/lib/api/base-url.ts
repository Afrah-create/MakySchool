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

export function normalizeApiPath(path: string) {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed.startsWith("/api/") ? trimmed.slice(4) : trimmed;
}

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

export function getServerApiBaseUrl() {
  const configured =
    process.env.API_INTERNAL_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  if (configured.startsWith("/")) {
    return withApiSuffix(`http://localhost:3001${configured}`);
  }

  return withApiSuffix(configured);
}
