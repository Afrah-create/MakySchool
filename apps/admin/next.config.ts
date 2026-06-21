import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMonorepoEnv } from "@makyschool/shared/load-env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadMonorepoEnv(monorepoRoot);

const apiOrigin = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@makyschool/shared", "@makyschool/ui"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiOrigin}/api/auth/:path*`,
      },
      {
        source: "/api/superadmin/:path*",
        destination: `${apiOrigin}/api/superadmin/:path*`,
      },
      {
        source: "/api/health",
        destination: `${apiOrigin}/api/health`,
      },
    ];
  },
};

export default nextConfig;
