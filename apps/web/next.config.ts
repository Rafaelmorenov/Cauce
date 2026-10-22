import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@comercial/contracts"],
  poweredByHeader: false,
};

export default nextConfig;
