import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Required for Firebase Hosting Spark (free) tier
};

export default nextConfig;
