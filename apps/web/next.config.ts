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
        source: "/api/schools/:path*",
        destination: `${apiOrigin}/api/schools/:path*`,
      },
      {
        source: "/api/webhooks/:path*",
        destination: `${apiOrigin}/api/webhooks/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
