/**
 * 画面の言葉の直書きを見つける (spec 31 D10)。見つけ方は hardcoded-text.ts。
 * 英語の直書きはこれでは捕まらないので、eslint の i18next/no-literal-string で見る
 */
import path from "node:path";
import { describe, expect, test } from "vitest";
import { hardcodedText, ROOT, sourceFiles } from "./hardcoded-text";

/** フォーク元の画面のコード。lib/desktop はデスクトップの側のテスト (__tests__/lib/desktop/hardcoded-text.test.ts) が見る */
const DIRS = ["app", "features", "components", "lib"];
const SKIP_DIRS = new Set(["__tests__", "stories", "node_modules", "desktop"]);

describe("画面の言葉の直書き", () => {
  test("フォーク元の画面のコードに、日本語の直書きが無い (訳のファイルへ)", () => {
    const files = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d), SKIP_DIRS));
    expect(files.length).toBeGreaterThan(50); // 探し方そのものが壊れていないことの下限
    expect(files.flatMap(hardcodedText)).toEqual([]);
  });

  test("見つけ方: 文字列・テンプレート・JSX の文字を拾い、コメントと i18n-allow の行は拾わない", () => {
    const tmp = path.join(ROOT, "__tests__/i18n/__fixtures__/hardcoded-sample.tsx");
    expect(hardcodedText(tmp).map((h) => h.replace(/^.*?:(\d+) /, "$1 "))).toEqual([
      "4 文字列",
      "5 前",
      "6 中身",
    ]);
  });
});
