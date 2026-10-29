/* global process, console */
// scripts/ui-style-snapshot.mjs の記録を比べる (spec 27)。
//
//   node scripts/ui-style-compare.mjs style <前の記録> <後の記録>
//     計算されたスタイルと画素の違いを場面ごとに出す (spec 27 受け入れ条件 4: ライトが前と同じか)
//   node scripts/ui-style-compare.mjs contrast <ライトの記録> <dark の記録>
//     dark の文字のコントラスト比が 4.5 以上、またはライトの同じ文字 (同じ道筋・同じ文字) の比以上かを見る (受け入れ条件 2)
//
// 違いがあれば終了コード 1
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
// pngjs と pixelmatch は jest-image-snapshot の依存 (直接の依存にはしていない)
const fromSnapshot = createRequire(require.resolve("jest-image-snapshot"));
const { PNG } = fromSnapshot("pngjs");
const pixelmatch = fromSnapshot("pixelmatch");

const [mode, a, b] = process.argv.slice(2);
if (!["style", "contrast"].includes(mode) || !a || !b) {
  console.error("使い方: node scripts/ui-style-compare.mjs style|contrast <A> <B>");
  process.exit(2);
}

const scenes = (dir, suffix) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix) && (suffix !== ".json" || !f.endsWith(".contrast.json")))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));

let failed = false;

/** 位置・大きさは 0.1px のずれを同じと見る (同じコードでも CodeMirror の行番号が 0.1px 揺れる, spec 27「P0 結果」) */
const nearRect = (x, y) => {
  const [p, q] = [x.split(",").map(Number), y.split(",").map(Number)];
  return p.length === q.length && p.every((v, i) => Math.abs(v - q[i]) <= 0.1 + 1e-9);
};

if (mode === "style") {
  let total = 0;
  for (const name of scenes(a, ".json")) {
    if (!fs.existsSync(path.join(b, `${name}.json`))) {
      console.log(`${name}\tB に無い`);
      failed = true;
      continue;
    }
    const A = read(a, `${name}.json`);
    const B = read(b, `${name}.json`);
    let items = 0;
    let diff = 0;
    let onlyA = 0;
    let onlyB = 0;
    const samples = new Map();
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!A[k]) onlyB++;
      else if (!B[k]) onlyA++;
      else
        for (const p of Object.keys(A[k])) {
          items++;
          if (A[k][p] === B[k][p] || (p === "rect" && nearRect(A[k][p], B[k][p]))) continue;
          diff++;
          if (!samples.has(p)) samples.set(p, `${k.slice(-70)}: ${A[k][p]} → ${B[k][p]}`);
        }
    }
    total += items;
    const pa = PNG.sync.read(fs.readFileSync(path.join(a, `${name}.png`)));
    const pb = PNG.sync.read(fs.readFileSync(path.join(b, `${name}.png`)));
    const px =
      pa.width === pb.width && pa.height === pb.height
        ? pixelmatch(pa.data, pb.data, null, pa.width, pa.height, { threshold: 0 })
        : "寸法違い";
    if (diff || onlyA || onlyB) failed = true;
    console.log(
      `${name}\t項目 ${items}\t違い ${diff}\tA だけ ${onlyA}\tB だけ ${onlyB}\t画素の違い ${px}`
    );
    for (const [p, s] of samples) console.log(`    ${p}\t${s}`);
  }
  console.log(`項目の合計 ${total}`);
} else {
  for (const name of scenes(b, ".contrast.json")) {
    const darkRows = read(b, `${name}.contrast.json`);
    const lightRows = fs.existsSync(path.join(a, `${name}.contrast.json`))
      ? read(a, `${name}.contrast.json`)
      : [];
    const light = new Map(lightRows.map((r) => [`${r.path}\t${r.text}`, r.ratio]));
    const bad = darkRows.filter(
      (r) => r.ratio < Math.min(4.5, light.get(`${r.path}\t${r.text}`) ?? 4.5)
    );
    if (bad.length) failed = true;
    console.log(`${name}\t文字 ${darkRows.length}\t満たさない ${bad.length}`);
    for (const r of bad)
      console.log(
        `    ${r.ratio}\t(ライト ${light.get(`${r.path}\t${r.text}`) ?? "—"})\t${r.color} on ${r.bg}\t${r.text}`
      );
  }
}

if (failed) process.exitCode = 1;
