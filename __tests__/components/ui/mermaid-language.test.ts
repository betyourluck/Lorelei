import { StringStream } from "@codemirror/language";
import { describe, expect, test } from "vitest";
import { mermaidStreamParser } from "@/components/ui/mermaid-language";

/** 文書を 1 行ずつ字句解析し、[文字列, 札] の列を返す（空白は落とす） */
function tokenize(doc: string): [string, string | null][] {
  const state = mermaidStreamParser.startState!(2);
  const out: [string, string | null][] = [];
  for (const line of doc.split("\n")) {
    const stream = new StringStream(line, 2, 2);
    while (!stream.eol()) {
      const style = mermaidStreamParser.token(stream, state);
      const text = stream.current();
      if (text.trim()) out.push([text, style]);
      stream.start = stream.pos;
    }
  }
  return out;
}

const styleOf = (tokens: [string, string | null][], text: string) =>
  tokens.find(([t]) => t === text)?.[1];

describe("mermaidStreamParser — flowchart", () => {
  const tokens = tokenize(
    [
      "flowchart TD",
      "  %% コメント",
      '  開始["開始する"] --> 判定{在庫はある？}',
      "  判定 -->|はい| 出荷(出荷する)",
      "  判定 -.-> 発注((発注))",
      "  subgraph 倉庫",
      "  end",
    ].join("\n")
  );

  test("図の種類と向き", () => {
    expect(styleOf(tokens, "flowchart")).toBe("keyword");
    expect(styleOf(tokens, "TD")).toBe("atom");
  });

  test("コメント・ノード ID・矢印・ラベル", () => {
    expect(styleOf(tokens, "%% コメント")).toBe("comment");
    expect(styleOf(tokens, "開始")).toBe("variableName");
    expect(styleOf(tokens, "-->")).toBe("operator");
    expect(styleOf(tokens, "-.->")).toBe("operator");
    expect(styleOf(tokens, "|はい|")).toBe("string");
  });

  test("形の中のラベルは文字列（括弧ごと）", () => {
    expect(styleOf(tokens, '["開始する"]')).toBe("string");
    expect(styleOf(tokens, "{在庫はある？}")).toBe("string");
    expect(styleOf(tokens, "(出荷する)")).toBe("string");
    expect(styleOf(tokens, "((発注))")).toBe("string");
  });

  test("キーワード", () => {
    expect(styleOf(tokens, "subgraph")).toBe("keyword");
    expect(styleOf(tokens, "end")).toBe("keyword");
  });
});

describe("mermaidStreamParser — erDiagram", () => {
  const tokens = tokenize(
    [
      "erDiagram",
      "  顧客 {",
      "    int id PK",
      "    string メール UK",
      "  }",
      '  顧客 ||--o{ 注文 : "注文する"',
    ].join("\n")
  );

  test("図の種類・テーブル名", () => {
    expect(styleOf(tokens, "erDiagram")).toBe("keyword");
    expect(styleOf(tokens, "顧客")).toBe("variableName");
  });

  test("{} の中は 型・名前・キー", () => {
    expect(styleOf(tokens, "int")).toBe("typeName");
    expect(styleOf(tokens, "id")).toBe("propertyName");
    expect(styleOf(tokens, "PK")).toBe("keyword");
    expect(styleOf(tokens, "メール")).toBe("propertyName");
    expect(styleOf(tokens, "UK")).toBe("keyword");
  });

  test("多重度・関係の名前", () => {
    expect(styleOf(tokens, "||--o{")).toBe("operator");
    expect(styleOf(tokens, '"注文する"')).toBe("string");
  });

  test("{} を出たらテーブル名に戻る（} の後の顧客は型ではない）", () => {
    const after = tokens.slice(tokens.findIndex(([t]) => t === "}") + 1);
    expect(after[0]).toEqual(["顧客", "variableName"]);
  });
});
