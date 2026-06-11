import type { NextConfig } from "next";

const apiOrigin = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@makyschool/shared"],
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
    ];
  },
};

export default nextConfig;
