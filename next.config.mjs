// Tauri の CLI は beforeDevCommand / beforeBuildCommand に TAURI_ENV_PLATFORM を渡す (Lorelei, spec 01 D9)。
// その時だけ GitHub Pages 用の basePath を外し、Tauri が読む out/ へ書き出す
const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const isPages = process.env.NODE_ENV === "production" && !isTauri;
// Tauri の dev は build と別の作業場所を使う (failures #15)。`output: "export"` の時、Next は distDir を
// 書き出し先と読み替えて作業場所を .next に固定する (build も dev も)。dev に静的書き出しは要らないので、
// Tauri の dev では output を外して自分の作業場所を持たせ、動いている dev を build が上書きしないようにする
const isTauriDev = isTauri && process.env.NODE_ENV !== "production";

// GitHub Pages の置き場所と書き出し先 (既定はフォーク元の /mermaid-editor と docs/)。
// 別の場所へ配る時は PAGES_BASE_PATH (例: /lorelei-web) と PAGES_DIST_DIR で差し替える (git の中の docs/ を上書きしないように, failures #18)
const pagesBasePath = process.env.PAGES_BASE_PATH || "/mermaid-editor";
const pagesDistDir = process.env.PAGES_DIST_DIR || "docs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isTauriDev ? undefined : "export",
  distDir: isTauriDev ? ".next-tauri-dev" : isTauri ? "out" : isPages ? pagesDistDir : ".next",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isPages ? pagesBasePath : "",
  assetPrefix: isPages ? `${pagesBasePath}/` : "",
};

export default nextConfig;
