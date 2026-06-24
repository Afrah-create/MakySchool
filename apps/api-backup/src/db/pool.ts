import type { PoolConfig } from "pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

function resolveSsl(url: string): PoolConfig["ssl"] {
  const forceSsl = process.env.DATABASE_SSL === "true";
  const isSupabase = url.includes("supabase.co") || url.includes("supabase.com");

  if (forceSsl || isSupabase) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var __makyschoolPool: Pool | undefined;
}

export const pool = globalThis.__makyschoolPool ?? new Pool({
  connectionString,
  ssl: resolveSsl(connectionString),
});

if (!globalThis.__makyschoolPool) {
  globalThis.__makyschoolPool = pool;
}
