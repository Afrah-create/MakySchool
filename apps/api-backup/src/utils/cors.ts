import type { CorsOptions } from "cors";

function parseAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return null;
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originMatchesPattern(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return origin === pattern;
  }

  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(origin);
  } catch {
    return false;
  }
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (allowedOrigins.some((pattern) => originMatchesPattern(origin, pattern))) {
    return true;
  }

  if (process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true") {
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith(".vercel.app")) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function resolveCorsOptions(): CorsOptions {
  const allowedOrigins = parseAllowedOrigins();

  if (!allowedOrigins?.length) {
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  };
}
