import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@makyschool/shared"],
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
