/**
 * デスクトップの外枠の言葉 (spec 34 D1)。lib/desktop に日本語の直書きが無く、名前空間 desktop の訳が全部の言語で同じキーと差し込みを持つ
 */
import path from "node:path";
import { describe, expect, test } from "vitest";
import { hardcodedText, ROOT, sourceFiles } from "@/__tests__/i18n/hardcoded-text";
import { LOCALES } from "@/components/i18n/i18n";
import { desktopResources } from "@/lib/desktop/i18n";

type Tree = { [key: string]: string | Tree };

const leaves = (tree: Tree, prefix = ""): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key.replace(/_(zero|one|two|few|many|other)$/, ""), v);
    else leaves(v, key).forEach((value, leaf) => out.set(leaf, value));
  }
  return out;
};
const slots = (value: string): string =>
  Array.from(value.matchAll(/\{\{\s*(\w+)/g), (m) => m[1])
    .sort()
    .join();

describe("デスクトップの外枠の言葉", () => {
  test("lib/desktop に日本語の直書きが無い (lib/desktop/locales へ)", () => {
    const files = sourceFiles(path.join(ROOT, "lib/desktop"), new Set(["locales"]));
    expect(files.length).toBeGreaterThan(15); // 探し方そのものが壊れていないことの下限
    expect(files.flatMap(hardcodedText)).toEqual([]);
  });

  test("言語の一覧の全部に desktop の訳がある", () => {
    for (const { code } of LOCALES) expect(desktopResources, code).toHaveProperty(code);
  });

  // 一覧へ足す前の言語の訳も見る (spec 35 D6: デスクトップの訳を一覧より先に入れる)
  test.each(Object.keys(desktopResources))(
    "%s の desktop の訳は日本語と同じキーと差し込みを持つ",
    (code) => {
      const base = leaves(desktopResources.ja as unknown as Tree);
      const mine = leaves((desktopResources as unknown as Record<string, Tree>)[code]);
      expect(
        Array.from(base.keys()).filter((k) => !mine.has(k)),
        "足りないキー"
      ).toEqual([]);
      expect(
        Array.from(mine.keys()).filter((k) => !base.has(k)),
        "日本語に無いキー"
      ).toEqual([]);
      expect(
        Array.from(base.entries()).filter(([k, v]) => slots(v) !== slots(mine.get(k) ?? ""))
      ).toEqual([]);
    }
  );
});
