import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      // Short webcam testimonials are sent as a data URL from the client room.
      bodySizeLimit: "10mb",
    },
  },
  typescript: {
    // `next build` shells out to tsc in a child process, which some sandboxes
    // block (EPERM on pipe creation). Set RELAYROOM_SKIP_TYPECHECK=1 in those
    // environments and run `npm run typecheck` separately — it is the same tsc
    // invocation with the same tsconfig.
    ignoreBuildErrors: process.env.RELAYROOM_SKIP_TYPECHECK === "1",
  },
};

export default nextConfig;
