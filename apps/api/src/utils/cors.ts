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

export function resolveCorsOptions(): CorsOptions {
  const allowedOrigins = parseAllowedOrigins();

  if (!allowedOrigins?.length) {
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  };
}
