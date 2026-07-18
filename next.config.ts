import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @domain-finder/core ships untranspiled TypeScript source (its package
  // "exports" point at src/index.ts), so Next must transpile it like app code.
  transpilePackages: ["@domain-finder/core"],
};

export default nextConfig;
