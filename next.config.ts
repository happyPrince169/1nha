import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Quick Add OCR uploads a client-optimized JPEG (target ≤ 2.5 MB) to a
      // Server Action. The framework default is 1 MB, which silently rejects
      // real phone photos as a generic server error. Allow headroom for the
      // processed image + multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
