import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow a 3 MB profile or caption photo plus multipart form overhead.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
