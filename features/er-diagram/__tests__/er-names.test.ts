/**
 * spec 13 D1・D2: ER 図の名前 (テーブル名・関係のラベル) の囲み方と、列を書けるかの判定。
 * 規則の根拠は spec 13 の「P0 結果」(mermaid.js 11.17.2 と merman に同じ入力を通した実測)
 */
import { describe, expect, test } from "vitest";
import { columnIssue, quoteErName } from "@/features/er-diagram/utils/er-names";

describe("quoteErName (D1)", () => {
  test.each(["ユーザー", "テーブル2", "注文明細", "ー長音", "User", "user", "u", "u注文", "_a", "a-b", "é", "only", "money", "zero", "relation", "行う"])(
    "%s は囲まない (両方の解析器で 1 つの名前として読める)",
    (name) => {
      expect(quoteErName(name)).toBe(name);
    }
  );

  test.each([
    // 空白・記号・数字始まり
    ["注文 明細", '"注文 明細"'],
    ["1abc", '"1abc"'],
    ["２番", '"２番"'],
    ["a.b", '"a.b"'],
    ["a(b)", '"a(b)"'],
    ["😀絵", '"😀絵"'],
    // キーワード・関係の記号で始まる (境界を見ない前方一致、大文字小文字を問わない)
    ["end", '"end"'],
    ["End", '"End"'],
    ["endpoint", '"endpoint"'],
    ["end注文", '"end注文"'],
    ["styles", '"styles"'],
    ["classes", '"classes"'],
    ["direction", '"direction"'],
    ["accDescr", '"accDescr"'],
    ["tokens", '"tokens"'],
    ["oneshot", '"oneshot"'],
    ["manyToMany", '"manyToMany"'],
    ["u-id", '"u-id"'],
    ["u.x", '"u.x"'],
  ])("%s は囲む", (name, expected) => {
    expect(quoteErName(name)).toBe(expected);
  });

  test("囲む時の書き換えの順: #語; の # → & → \" → % → \\ → direction + 空白 + 向き の空白", () => {
    expect(quoteErName('a "b"')).toBe('"a #quot;b#quot;"');
    expect(quoteErName("#1;")).toBe('"#35;1;"');
    expect(quoteErName("a#b")).toBe('"a#b"');
    expect(quoteErName("a&amp;b")).toBe('"a#38;amp;b"');
    expect(quoteErName("50%")).toBe('"50#37;"');
    expect(quoteErName("C:\\dir")).toBe('"C:#92;dir"');
    expect(quoteErName("direction LR")).toBe('"direction#32;LR"');
    expect(quoteErName("x Direction  tb y")).toBe('"x Direction#32;#32;tb y"');
    expect(quoteErName("direction\u3000rl")).toBe('"direction#12288;rl"');
    // 向きでない語の前の空白はそのまま
    expect(quoteErName("direction up")).toBe('"direction up"');
  });
});

describe("columnIssue (D2)", () => {
  test.each([
    ["int", "id"],
    ["varchar(255)", "name"],
    ["decimal(10,2)", "price"],
    ["string[]", "tags"],
    ["整数", "注文日"],
    ["int", "２番"],
    ["int", "pk_id"],
    ["int", "a-b"],
    ["int", "*a"],
    ["List~int~", "items"],
    ["int", "😀"],
  ])("%s %s は書ける", (type, name) => {
    expect(columnIssue({ type, name })).toBeNull();
  });

  test("名前も型も空 (足した直後) / 片方だけ空", () => {
    expect(columnIssue({ type: "", name: "" })).toBe("empty");
    expect(columnIssue({ type: " ", name: "" })).toBe("empty");
    expect(columnIssue({ type: "int", name: "" })).toBe("empty-name");
    expect(columnIssue({ type: "", name: "id" })).toBe("empty-type");
  });

  test.each(["注 文", "a:b", "a/b", "a'b", 'a"b', "a#b", "a%b", "a~b", "1a", "-a", ".a", "(a)", "pk", "Pk", "PK-x", "fk", "uk", "°", "·x", "¥x", " id", "a?"])(
    "列名 %s は書けない",
    (name) => {
      expect(columnIssue({ type: "int", name })).toBe("bad-name");
    }
  );

  test.each(["varchar 255", "a:b", "pk", "1int", "a~b", "~int~"])("型 %s は書けない", (type) => {
    expect(columnIssue({ type, name: "x" })).toBe("bad-type");
  });
});
