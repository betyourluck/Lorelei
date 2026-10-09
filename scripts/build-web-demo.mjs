/* global process, console */
// Lorelei の Web 版のデモを作り、GitHub Pages のリポジトリのフォルダへ写す。
//
//   node scripts/build-web-demo.mjs <写し先のフォルダ> [--base-path /lorelei-web]
//   例: node scripts/build-web-demo.mjs ../betyourluck.github.io/docs/lorelei-web
//
// - Web 版は MCP もデスクトップの外枠も持たない、フォーク元のエディタそのもの (lib/desktop/ は Tauri の外では何もしない)
// - 書き出し先は out-web-demo/ (素の next build は git の中の docs/ を上書きする, failures #18)
// - 写し先の中身は入れ替える。ただし、前にこのスクリプトが写した印 (.lorelei-web-demo) がある時か、空の時だけ (別のものを消さないため)
// - _next/ を配るには、写し先のサイトの公開の根 (例: docs/) に .nojekyll が要る (このスクリプトは作らない。無ければ知らせる)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const baseFlag = args.indexOf("--base-path");
const basePath = baseFlag >= 0 ? args[baseFlag + 1] : "/lorelei-web";
if (!target || !basePath?.startsWith("/")) {
  console.error("使い方: node scripts/build-web-demo.mjs <写し先のフォルダ> [--base-path /lorelei-web]");
  process.exit(2);
}

const MARK = ".lorelei-web-demo";
const out = "out-web-demo";
const dest = path.resolve(target);
if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0 && !fs.existsSync(path.join(dest, MARK))) {
  console.error(`写し先が空でなく、前に写した印 (${MARK}) もありません。消してよいか確かめてから空にしてください: ${dest}`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
execSync("corepack pnpm@9 exec next build", {
  stdio: "inherit",
  env: {
    ...process.env,
    PAGES_BASE_PATH: basePath,
    PAGES_DIST_DIR: out,
    NEXT_PUBLIC_REPOSITORY_URL: "https://github.com/betyourluck/Lorelei",
    NEXT_PUBLIC_SITE_TITLE: "Lorelei Mermaid エディター (Web 版)",
  },
});

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(out, dest, { recursive: true });
fs.writeFileSync(path.join(dest, MARK), `${new Date().toISOString()} scripts/build-web-demo.mjs base-path=${basePath}\n`);
console.log(`写した: ${dest}`);

// 公開の根を、basePath の段数だけ上がって探す (/lorelei-web なら 1 つ上)
const depth = basePath.split("/").filter(Boolean).length;
const root = path.resolve(dest, ...Array(depth).fill(".."));
if (!fs.existsSync(path.join(root, ".nojekyll"))) {
  console.warn(`注意: ${root} に .nojekyll がありません。GitHub Pages の Jekyll が _next/ を配らず、ページが崩れます`);
}
