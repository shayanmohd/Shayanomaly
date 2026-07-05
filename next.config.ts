import type { NextConfig } from "next";

// Two build targets share this config:
//  - default:            static export for GitHub Pages (out/)
//  - BUILD_TARGET=node:  standalone server build for Docker (Dockerfile sets it)
const isNodeBuild = process.env.BUILD_TARGET === "node";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: isNodeBuild ? "standalone" : "export",
  ...(basePath ? { basePath } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
