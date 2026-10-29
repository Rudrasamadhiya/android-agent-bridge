import type { NextConfig } from "next";

// Served from GitHub Pages at /android-agent-bridge, so production paths need that prefix.
const base = process.env.NODE_ENV === "production" ? "/android-agent-bridge" : "";

const config: NextConfig = {
  output: "export",
  basePath: base,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE: base },
  turbopack: { root: __dirname },
};

export default config;
