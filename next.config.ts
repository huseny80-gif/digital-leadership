import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow Server Actions from any origin in production (Vercel, custom domains)
      // and localhost for local development
      allowedOrigins: process.env.NEXTAUTH_URL
        ? [
            new URL(process.env.NEXTAUTH_URL).host,
            "localhost:3000",
          ]
        : ["localhost:3000"],
    },
  },
};

export default nextConfig;
