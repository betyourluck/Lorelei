/**
 * CodeMirror の文言の和訳表のテスト。網羅を手書きの一覧で確かめず、エディタが使う包みの dist から
 * `phrase()` に渡される文字列を実際に抜いて照合する（Kataribe と同じ流儀）。
 * ライブラリを上げて文言が増えたら、ここが落ちて気づける。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { EDITOR_PHRASES_JA } from "@/components/ui/editor-phrases";

/** エディタが使う CodeMirror の包み。どれも `phrase()` で英語の文言を引く */
const PACKAGES = [
  "@codemirror/search",
  "@codemirror/lint",
  "@codemirror/autocomplete",
  "@codemirror/view",
  "@codemirror/commands",
  "@codemirror/language",
];

/** dist が実際に `phrase()` へ渡すキー */
function libraryPhraseKeys(): string[] {
  const require = createRequire(import.meta.url);
  const keys = new Set<string>();
  for (const pkg of PACKAGES) {
    const src = readFileSync(require.resolve(pkg), "utf8");
    // `state.phrase("X"` / `view.state.phrase("X"` / `phrase(view, "X")`
    for (const m of Array.from(src.matchAll(/\.phrase\(\s*"([^"]+)"/g))) keys.add(m[1]);
    for (const m of Array.from(src.matchAll(/\bphrase\(\s*\w+\s*,\s*"([^"]+)"/g))) keys.add(m[1]);
  }
  return Array.from(keys).sort();
}

describe("EDITOR_PHRASES_JA", () => {
  test("ライブラリが引く文言をすべて覆う", () => {
    const lib = libraryPhraseKeys();
    expect(lib.length).toBeGreaterThan(10); // 抽出そのものが壊れていないことの下限
    expect(lib.filter((k) => !(k in EDITOR_PHRASES_JA))).toEqual([]);
  });

  test("使われないキーを抱えない（綴り違いは黙って英語のまま出る）", () => {
    const lib = new Set(libraryPhraseKeys());
    expect(Object.keys(EDITOR_PHRASES_JA).filter((k) => !lib.has(k))).toEqual([]);
  });

  test("差し込み位置 $ を落とさない", () => {
    for (const [key, value] of Object.entries(EDITOR_PHRASES_JA)) {
      if (key.includes("$")) expect(value).toContain("$");
    }
  });
});
