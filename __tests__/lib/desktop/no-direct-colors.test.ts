import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// spec 27 D4: デスクトップの外枠 (lib/desktop) も画面の色を直に書かず、[ライト, dark] を持つ色の名
// (components/providers/theme.ts) で書く。フォーク元の分は __tests__/components/providers/no-direct-colors.test.ts

/** P0 の表の I: ライトでも dark でも今のままでよい色 (ファイルと、その行の中の文字。その文字を除いた残りは見る) */
const KEEP: [string, string][] = [
  ["lib/desktop/title-bar.tsx", 'listening: "green.500"'], // MCP の状態の点
  ["lib/desktop/title-bar.tsx", 'stopped: "gray.400"'],
  ["lib/desktop/title-bar.tsx", 'failed: "red.500"'],
  ["lib/desktop/title-bar.tsx", 'blocked: "red.500"'],
  ["lib/desktop/title-bar.tsx", 'bg: "#e53935"'], // 閉じるボタンに乗せた時 (Windows と同じ赤に白)
  ["lib/desktop/title-bar.tsx", 'color: "white"'],
  ["lib/desktop/pane-splitter.tsx", '"blue.400"'], // つまみを掴んだ・乗せた時
];

const LITERAL =
  /["'](white|black|(?:gray|blue|primary|orange|red|yellow|green|neutral)\.\d+)["']|(?<![\w/])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b|rgba?\(/;

const sources = () =>
  execSync("git ls-files lib", { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.(test|stories)\./.test(f));

describe("デスクトップの外枠に直に書いた色が残っていない (spec 27 D4)", () => {
  it("色の名で書く (P0 の表の I を除く)", () => {
    const found: string[] = [];
    for (const file of sources()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
          const rest = KEEP.filter(([f]) => f === file).reduce(
            (l, [, s]) => l.replaceAll(s, ""),
            line
          );
          if (LITERAL.test(rest)) found.push(`${file}:${i + 1}\t${t}`);
        });
    }
    expect(found).toEqual([]);
  });

  it("許しの一覧 (I) はどれも今のコードにある (消えたら一覧から外す)", () => {
    for (const [file, s] of KEEP)
      expect([file, readFileSync(file, "utf8").includes(s)]).toEqual([file, true]);
  });
});
