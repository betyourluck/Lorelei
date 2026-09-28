// Tauri の CLI は beforeDevCommand / beforeBuildCommand に TAURI_ENV_PLATFORM を渡す (Lorelei, spec 01 D9)。
// その時だけ GitHub Pages 用の basePath を外し、Tauri が読む out/ へ書き出す
const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const isPages = process.env.NODE_ENV === "production" && !isTauri;
// Tauri の dev は build と別の作業場所を使う (failures #15)。`output: "export"` の時、Next は distDir を
// 書き出し先と読み替えて作業場所を .next に固定する (build も dev も)。dev に静的書き出しは要らないので、
// Tauri の dev では output を外して自分の作業場所を持たせ、動いている dev を build が上書きしないようにする
const isTauriDev = isTauri && process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isTauriDev ? undefined : "export",
  distDir: isTauriDev ? ".next-tauri-dev" : isTauri ? "out" : isPages ? "docs" : ".next",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isPages ? "/mermaid-editor" : "",
  assetPrefix: isPages ? "/mermaid-editor/" : "",
};

export default nextConfig;
