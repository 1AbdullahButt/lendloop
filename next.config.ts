import type { NextConfig } from "next";
import { STATIC_HEADERS } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev badge; it adds nothing for users and clutters QA screenshots.
  devIndicators: false,
  // The Content-Security-Policy is per request (nonce), set by Clerk's middleware; these are static.
  async headers() {
    return [{ source: "/(.*)", headers: STATIC_HEADERS }];
  },
};

export default nextConfig;
