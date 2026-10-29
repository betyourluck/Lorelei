import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// spec 27 D4: フォーク元の部品は画面の色を直に書かず、[ライト, dark] を持つ色の名 (components/providers/theme.ts) で書く。
// 直に書くと dark でもその色のまま残る (P0: 白い面に白い文字)

/** D6: CodeMirror (今も暗い) と Mermaid のプレビューの中は変えない。theme.ts は色の名の定義そのもの */
const SKIP = new Set([
  "components/ui/code-editor.tsx",
  "components/ui/lazy-code-editor.tsx",
  "components/ui/copy-button.tsx",
  "components/ui/mermaid-preview.tsx",
  "components/ui/mermaid-code-with-preview.tsx",
  "components/ui/mermaid-editor-with-preview.tsx",
  "components/ui/mermaid-theme.ts",
  "components/providers/theme.ts",
]);

/** P0 の表の I: ライトでも dark でも今のままでよい色 (ファイルと、その行に含まれる文字) */
const KEEP: [string, string][] = [
  ["components/ui/contribution-panel.tsx", 'bg="gray.600"'], // Web 版の右上の GitHub のボタン (濃い地に白)
  ["components/ui/contribution-panel.tsx", 'color="white"'],
  ["components/ui/contribution-panel.tsx", 'bg: "black"'],
  ["features/flowchart/components/editor/variable-name-editor.tsx", 'bg="blue.500"'], // ノードの ID の札
  ["features/flowchart/components/editor/variable-name-editor.tsx", 'color="white"'],
  ["features/flowchart/components/editor/variable-name-editor.tsx", 'bg: "blue.600"'],
  ["features/flowchart/components/node/subgraph-node.tsx", "#8a8a1f"], // 枠の縁 (暗い地でも読める)
  ["features/flowchart/components/edge/edge-label.module.css", "rgb(0, 112, 240)"], // フォーカスの輪
  ["features/flowchart/hooks/edge-layout.ts", '"#ff6b6b"'], // 循環の線 (既定で使わない)
];

const LITERAL =
  /["'](white|black|(?:gray|blue|primary|orange|red|yellow|green|neutral)\.\d+)["']|(?<![\w/])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b|rgba?\(/;

const sources = () =>
  execSync("git ls-files app components features", { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.(test|stories)\./.test(f) && !SKIP.has(f));

describe("フォーク元の部品に直に書いた色が残っていない (spec 27 D4)", () => {
  it("色の名で書く (D6 と P0 の表の I を除く)", () => {
    const found: string[] = [];
    for (const file of sources()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
          if (!LITERAL.test(line)) return;
          if (KEEP.some(([f, s]) => f === file && line.includes(s))) return;
          found.push(`${file}:${i + 1}\t${t}`);
        });
    }
    expect(found).toEqual([]);
  });

  it("許しの一覧 (I) はどれも今のコードにある (消えたら一覧から外す)", () => {
    for (const [file, s] of KEEP)
      expect([file, readFileSync(file, "utf8").includes(s)]).toEqual([file, true]);
  });
});
