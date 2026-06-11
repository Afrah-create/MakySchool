function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function withApiSuffix(value: string) {
  const normalized = stripTrailingSlash(value);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

/** Browser/client API base — same-origin proxy in dev by default. */
export function getClientApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
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
