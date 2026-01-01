import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN || "http://localhost:3000";
const apiV1Path = process.env.API_V1_PATH || "/v1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}${apiV1Path}/:path*`,
      },
    ];
  },
};

export default nextConfig;
