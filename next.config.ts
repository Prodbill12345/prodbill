import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run in Node.js, not be bundled by Webpack
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
