import { findClusterBreak } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { countChars, overwriteSpan } from "@/components/ui/editor-typing";

/** 実際の呼び出し形（CodeMirror の `findClusterBreak` を噛ませる） */
function span(line: string, offset: number): number {
  return overwriteSpan(line.length, offset, findClusterBreak(line, offset));
}

describe("overwriteSpan — 上書きで消す幅", () => {
  test("ふつうの 1 文字", () => {
    expect(span("abc", 0)).toBe(1);
    expect(span("あいう", 1)).toBe(1);
  });

  test("行末では消さない（次の行を食わない）", () => {
    expect(span("abc", 3)).toBe(0);
    expect(span("", 0)).toBe(0);
  });

  test("サロゲートペアを半分にしない", () => {
    const line = "a🎉b"; // 🎉 は UTF-16 で 2
    expect(span(line, 1)).toBe(2);
    expect(span(line, 3)).toBe(1);
    expect(span(line, 4)).toBe(0);
  });

  test("結合文字を割らない", () => {
    const line = "が゙b";
    expect(span(line, 0)).toBe(findClusterBreak(line, 0));
  });

  test("クラスタが進まない異常値では触らない", () => {
    expect(overwriteSpan(5, 2, 2)).toBe(0);
    expect(overwriteSpan(5, 2, 1)).toBe(0);
  });

  test("行の長さを越えない", () => {
    expect(overwriteSpan(3, 2, 9)).toBe(1);
  });
});

describe("countChars — フッタの文字数", () => {
  test("コードポイントで数える（絵文字を 2 と数えない）", () => {
    expect(countChars("abc")).toBe(3);
    expect(countChars("あいう")).toBe(3);
    expect(countChars("🎉")).toBe(1);
    expect("🎉".length).toBe(2);
  });

  test("改行も 1 文字として数える", () => {
    expect(countChars("a\nb")).toBe(3);
    expect(countChars("")).toBe(0);
  });
});
