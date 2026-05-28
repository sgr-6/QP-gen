import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Required for Firebase Hosting Spark (free) tier
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
