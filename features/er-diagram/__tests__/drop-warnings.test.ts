import { describe, expect, test } from "vitest";
import { erDropWarnings } from "@/features/er-diagram/utils/drop-warnings";

const lines = (text: string) => erDropWarnings(text).map((w) => w.line);
const messageAt = (text: string, line: number) => erDropWarnings(text).find((w) => w.line === line)?.message;

// spec 11 D4: ER 図で取り込むと消える書き方の行に付ける印 (字句で見つける目安)
describe("erDropWarnings", () => {
  test("消えない書き方には印を付けない", () => {
    expect(
      lines(
        [
          "erDiagram",
          "  direction LR",
          "  顧客 {",
          "    int id PK",
          "    string 名前 UK, FK",
          "  }",
          '  顧客 ||--o{ 注文 : "style を含む名前"',
          "  注文 ||--|{ 明細 : 含む",
        ].join("\n")
      )
    ).toEqual([]);
  });

  test("非識別の別の書き方 (.- と -.) も見る。frontmatter は見ない (rev1、査読 11)", () => {
    const text = "---\ntitle: 図\n---\nerDiagram\n  A ||.-o{ B : r\n  B ||-.o{ C : s\n  C ||--o{ D : t\n";
    expect(lines(text)).toEqual([5, 6]);
    expect(messageAt(text, 5)).toContain("非識別");
  });

  test("別名 ・ 列の注釈 ・ 非識別 ・ エディタに無い多重度 ・ class と style", () => {
    const text = [
      "erDiagram",
      '  顧客["お客さま"] {',
      '    int id PK "主キー"',
      "  }",
      "  顧客 ||..o{ 注文 : 行う",
      "  注文 }|--|{ 明細 : 含む",
      "  classDef hot fill:#f00",
      "  class 顧客 hot",
      "  style 注文 fill:#0f0",
    ].join("\n");
    expect(lines(text)).toEqual([2, 3, 5, 6, 7, 8, 9]);
    expect(messageAt(text, 2)).toContain("別名");
    expect(messageAt(text, 3)).toContain("注釈");
    expect(messageAt(text, 5)).toContain("非識別");
    expect(messageAt(text, 6)).toContain("1 対 多");
  });
});
