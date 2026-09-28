import { describe, expect, test } from "vitest";
import { mermaidCandidates } from "@/components/ui/mermaid-completion";

/** `█` をカーソルとして、その位置の候補の label を返す */
function labelsAt(docWithCursor: string): string[] {
  const pos = docWithCursor.indexOf("█");
  const text = docWithCursor.slice(0, pos) + docWithCursor.slice(pos + 1);
  return mermaidCandidates(text, pos).options.map((o) => o.label);
}
function resultAt(docWithCursor: string) {
  const pos = docWithCursor.indexOf("█");
  const text = docWithCursor.slice(0, pos) + docWithCursor.slice(pos + 1);
  return mermaidCandidates(text, pos);
}

describe("mermaidCandidates — 図の種類と向き", () => {
  test("1 行目は図の種類", () => {
    expect(labelsAt("█")).toEqual(
      expect.arrayContaining(["flowchart TD", "flowchart LR", "graph TD", "erDiagram"])
    );
    expect(labelsAt("fl█")).toContain("flowchart TD");
  });

  test("flowchart / graph / direction の直後は向き", () => {
    for (const doc of ["flowchart █", "graph █", "flowchart TD\n  subgraph 倉庫\n    direction █"]) {
      expect(labelsAt(doc)).toEqual(["TD", "TB", "BT", "LR", "RL"]);
    }
  });
});

describe("mermaidCandidates — flowchart", () => {
  const head = 'flowchart TD\n  開始["開始する"] --> 判定{在庫？}\n  判定 -->|はい| 出荷\n';

  test("行頭と矢印の後は、文書の中のノード ID", () => {
    expect(labelsAt(`${head}  █`)).toEqual(expect.arrayContaining(["開始", "判定", "出荷"]));
    expect(labelsAt(`${head}  出荷 --> █`)).toEqual(expect.arrayContaining(["開始", "判定"]));
  });

  test("ID の打ちかけ (日本語) は置換範囲に入る = IME の確定で二重にならない", () => {
    const r = resultAt(`${head}  判█`);
    const pos = `${head}  判`.length;
    expect(r.from).toBe(pos - 1);
    expect(r.validFor.test("判定")).toBe(true);
    // 置換範囲と validFor は同じ文字集合 (Kataribe spec 28)
    expect(r.validFor.test("判定 ")).toBe(false);
  });

  test("自分が今打っている語は候補に出さない", () => {
    expect(labelsAt(`${head}  新しい█`)).not.toContain("新しい");
  });

  test("ノード ID の後は矢印と形", () => {
    const labels = labelsAt(`${head}  出荷 █`);
    expect(labels).toEqual(expect.arrayContaining(["-->", "-.->", "==>", "---"]));
    expect(labels).toEqual(expect.arrayContaining(["[四角]", "(角丸)", "{ひし形}", "((円))"]));
  });

  test("形は直前の空白を詰め、中身を選んだ状態で入る", () => {
    // ID を打ちかけの位置で出すと、CodeMirror が打ちかけの語で候補を絞って形が消える。
    // なので ID の後の空白の位置で出し、選んだら空白を詰めて `出荷[四角]` にする
    const shape = resultAt(`${head}  出荷 █`).options.find((o) => o.label === "[四角]");
    expect(shape?.insert).toBe("[四角]");
    expect(shape?.select).toEqual([1, 3]);
    expect(shape?.eatBefore).toBe(1);
    const shape2 = resultAt(`${head}  出荷   █`).options.find((o) => o.label === "((円))");
    expect(shape2?.eatBefore).toBe(3);
    // 矢印は空白を詰めない
    expect(resultAt(`${head}  出荷 █`).options.find((o) => o.label === "-->")?.eatBefore).toBeUndefined();
  });

  test("ラベルの中・文字列の中・コメントでは出さない", () => {
    expect(labelsAt(`${head}  判定 -->|は█`)).toEqual([]);
    expect(labelsAt(`${head}  判定["開█`)).toEqual([]);
    expect(labelsAt(`${head}  %% 開█`)).toEqual([]);
  });
});

describe("mermaidCandidates — erDiagram", () => {
  const head = "erDiagram\n  顧客 {\n    int id PK\n  }\n  注文 ||--o{ 明細 : 含む\n";

  test("行頭 ({} の外) はテーブル名", () => {
    expect(labelsAt(`${head}  █`)).toEqual(expect.arrayContaining(["顧客", "注文", "明細"]));
  });

  test("テーブル名の後は、エディタが扱える多重度 7 つと {", () => {
    const labels = labelsAt(`${head}  顧客 █`);
    expect(labels).toEqual([
      "||--||",
      "||--o{",
      "||--|{",
      "||--o|",
      "}o--||",
      "}o--o{",
      "o|--||",
      "{",
    ]);
  });

  test("多重度の後はテーブル名", () => {
    expect(labelsAt(`${head}  顧客 ||--o{ █`)).toEqual(expect.arrayContaining(["注文", "明細"]));
  });

  test("{} の中の行頭は型、型と名前の後はキー", () => {
    const inBlock = "erDiagram\n  商品 {\n    ";
    expect(labelsAt(`${inBlock}█`)).toEqual(expect.arrayContaining(["int", "string", "date"]));
    expect(labelsAt(`${inBlock}int 単価 █`)).toEqual(["PK", "FK", "UK"]);
  });

  test("{} の中の名前の位置 (型の後) では何も出さない", () => {
    expect(labelsAt("erDiagram\n  商品 {\n    int █")).toEqual([]);
  });
});

describe("mermaidCandidates — 開き方", () => {
  test("打ちかけの語", () => {
    expect(resultAt("flowchart TD\n  █").typed).toBe("");
    expect(resultAt("flowchart TD\n  判█").typed).toBe("判");
  });

  test("行頭・1 行目は打ち始めてから開く (Enter の改行で候補を確定させない)", () => {
    expect(resultAt("█").auto).toBe(false);
    expect(resultAt("flowchart TD\n  A --> B\n  █").auto).toBe(false);
    expect(resultAt("erDiagram\n  顧客 {\n    █").auto).toBe(false);
  });

  test("次に書くものが決まっている位置は打たなくても開く", () => {
    expect(resultAt("flowchart █").auto).toBe(true);
    expect(resultAt("flowchart TD\n  A --> B\n  B --> █").auto).toBe(true);
    expect(resultAt("flowchart TD\n  A --> B\n  B █").auto).toBe(true);
    expect(resultAt("erDiagram\n  顧客 █").auto).toBe(true);
    expect(resultAt("erDiagram\n  顧客 ||--o{ █").auto).toBe(true);
    expect(resultAt("erDiagram\n  顧客 {\n    int id █").auto).toBe(true);
  });
});

describe("mermaidCandidates — 図の種類で 1 行目を絞る", () => {
  const at = (doc: string, kind: "flowchart" | "er") => {
    const pos = doc.indexOf("█");
    return mermaidCandidates(doc.replace("█", ""), pos, kind).options.map((o) => o.label);
  };

  test("フローチャートのダイアログには erDiagram を出さない", () => {
    expect(at("█", "flowchart")).toEqual(["flowchart TD", "flowchart LR", "graph TD"]);
  });

  test("ER 図のダイアログには erDiagram だけ", () => {
    expect(at("█", "er")).toEqual(["erDiagram"]);
  });
});
