/**
 * 訳のファイルのテスト (spec 31 D10)。言語の一覧にある全部の言語が、組み立ての言語 (日本語) と同じキーの組と差し込みを持つ。
 * 足りないキーは英語に落ちて動いてしまうので、ここで落とす
 */
import { describe, expect, test } from "vitest";
import { BUILD_LOCALE, LOCALES, resources } from "@/components/i18n/i18n";

type Tree = { [key: string]: string | Tree };

/** 葉のキー (点でつなぐ) → 値。複数形の接尾辞 (_zero・_one・_two・_few・_many・_other) は外す */
const leaves = (tree: Tree, prefix = ""): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key.replace(/_(zero|one|two|few|many|other)$/, ""), v);
    else leaves(v, key).forEach((value, leaf) => out.set(leaf, value));
  }
  return out;
};

/** 差し込み ({{name}}) の名の組 */
const slots = (value: string): string[] =>
  Array.from(value.matchAll(/\{\{\s*(\w+)/g), (m) => m[1]).sort();

const base = leaves(resources[BUILD_LOCALE].common as unknown as Tree);

describe("訳のファイル", () => {
  test("言語の一覧の全部に訳がある", () => {
    for (const { code } of LOCALES) expect(resources, code).toHaveProperty(code);
  });

  test.each(LOCALES.map((l) => l.code))("%s は日本語と同じキーの組を持つ", (code) => {
    const mine = leaves(resources[code].common as unknown as Tree);
    expect(
      Array.from(base.keys()).filter((k) => !mine.has(k)),
      "足りないキー"
    ).toEqual([]);
    expect(
      Array.from(mine.keys()).filter((k) => !base.has(k)),
      "日本語に無いキー"
    ).toEqual([]);
  });

  test.each(LOCALES.map((l) => l.code))("%s は日本語と同じ差し込みを持つ", (code) => {
    const mine = leaves(resources[code].common as unknown as Tree);
    const differ = Array.from(base.entries())
      .filter(([k, v]) => mine.has(k) && slots(v).join() !== slots(mine.get(k)!).join())
      .map(([k]) => k);
    expect(differ).toEqual([]);
  });
});
