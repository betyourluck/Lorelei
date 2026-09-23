// Tauri の CLI は beforeDevCommand / beforeBuildCommand に TAURI_ENV_PLATFORM を渡す (Lorelei, spec 01 D9)。
// その時だけ GitHub Pages 用の basePath を外し、Tauri が読む out/ へ書き出す
const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const isPages = process.env.NODE_ENV === "production" && !isTauri;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: isTauri && process.env.NODE_ENV === "production" ? "out" : isPages ? "docs" : ".next",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isPages ? "/mermaid-editor" : "",
  assetPrefix: isPages ? "/mermaid-editor/" : "",
};

export default nextConfig;
