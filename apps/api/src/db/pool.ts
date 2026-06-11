import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

declare global {
  // eslint-disable-next-line no-var
  var __makyschoolPool: Pool | undefined;
}

export const pool = globalThis.__makyschoolPool ?? new Pool({
  connectionString,
});

if (!globalThis.__makyschoolPool) {
  globalThis.__makyschoolPool = pool;
}