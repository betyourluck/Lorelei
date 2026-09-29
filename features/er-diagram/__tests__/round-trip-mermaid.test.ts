/**
 * spec 11 D5 (rev1): ER 図のコード生成のコードが mermaid.js で通り、インポート (mermaid.js の解析) で元に戻る
 */
import { describe, expect, test, vi } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import { erFromMermaid } from "@/features/er-diagram/utils/from-mermaid";
import { generateERDiagramMermaidCode } from "@/features/er-diagram/utils/generate-mermaid-code";

vi.unmock("@/components/ui/mermaid-render");

const nodes = [
  { id: "t1", type: "erTable", position: { x: 0, y: 0 }, data: { name: "顧客", columns: [{ name: "名前", type: "varchar(255)", pk: false, uk: false }] } },
  { id: "t2", type: "erTable", position: { x: 0, y: 0 }, data: { name: "注文", columns: [{ name: "id", type: "int", pk: true, uk: false }] } },
];

describe("ER 図のコード生成 → インポートの往復 (mermaid.js)", () => {
  test.each(["注文する", "注文する (本人)", 'say "hi"', "a b", "places-order", "1..n"])("関係のラベル %s が元に戻る", async (label) => {
    const code = generateERDiagramMermaidCode(nodes as never, [
      { id: "e", type: "erEdge", source: "t1", target: "t2", data: { label, cardinality: "one-to-many" } },
    ] as never);
    const snapshot = await readMermaidDiagram(code);
    if (snapshot.kind !== "er") throw new Error(code);
    const { data, dropped } = erFromMermaid(snapshot);
    expect(data.edges[0].data, code).toMatchObject({ label, cardinality: "one-to-many" });
    expect(data.nodes[0].columns[0], code).toMatchObject({ name: "名前", type: "varchar(255)" });
    expect(dropped, code).toEqual([]);
  });
});

// spec 13 P1: テーブル名と関係のラベルの格子 (P0 で片方か両方の解析器が壊した名前)。TS の経路。Rust の経路は crates/lorelei_core/tests/editor.rs (P3)
const NAMES = [
  "ユーザー", "注文 明細", "tokens", "topic", "oneshot", "manyToMany", "to", "one", "many", "end", "End", "end注文",
  "style", "style注文", "class", "classes", "classDef", "subgraph", "erDiagram", "direction", "accTitle", "accDescr",
  "u-id", "u.x", "u注文", "1abc", "２番", "a.b", "a*b", "a(b)", "a:b", "a~b", "😀絵", "é",
  'a"b', "#1;", "a#b", "a&amp;b", "50%", "C:\\dir", "direction LR", "x direction TB y", "direction\u3000rl",
  // フォーク元のテストがラベルに使う多重度の名前 (旧の生成器は囲まず、zero-to-one 以外が文法の誤り)
  "one-to-one", "one-to-many", "many-to-one", "many-to-many", "zero-to-one", "one-to-zero", "one-to-many-mandatory",
];

describe("ER 図の名前の往復 (spec 13 D1、mermaid.js)", () => {
  test.each(NAMES)("テーブル名と関係のラベル %s が元に戻る", async (name) => {
    const code = generateERDiagramMermaidCode(
      [
        { id: "t1", type: "erTable", position: { x: 0, y: 0 }, data: { name, columns: [{ name: "id", type: "int", pk: true, uk: false }] } },
        { id: "t2", type: "erTable", position: { x: 0, y: 0 }, data: { name: "B", columns: [] } },
      ] as never,
      [{ id: "e", type: "erEdge", source: "t2", target: "t1", data: { label: name, cardinality: "one-to-many" } }] as never
    );
    const snapshot = await readMermaidDiagram(code);
    if (snapshot.kind !== "er") throw new Error(code);
    const { data, dropped } = erFromMermaid(snapshot);
    expect(data.nodes.map((n) => n.name), code).toEqual([name, "B"]);
    expect(data.nodes[0].columns, code).toMatchObject([{ name: "id", type: "int", pk: true, uk: false }]);
    expect(data.edges.map((e) => [e.source, e.target, e.data?.label]), code).toEqual([["B", name, name]]);
    expect(dropped, code).toEqual([]);
  });
});

describe("書けない列は書き出さない (spec 13 D2、mermaid.js)", () => {
  test("書きかけ・書けない列を飛ばし、残りの列と、列が 0 件になったテーブルは戻る", async () => {
    const code = generateERDiagramMermaidCode(
      [
        {
          id: "t1",
          type: "erTable",
          position: { x: 0, y: 0 },
          data: {
            name: "注文",
            columns: [
              { name: "", type: "", pk: false, uk: false },
              { name: "id", type: "int", pk: true, uk: false },
              { name: "", type: "int", pk: false, uk: false },
              { name: "注文 日", type: "date", pk: false, uk: false },
              { name: "pk", type: "int", pk: false, uk: false },
              { name: "tags", type: "List~string~", pk: false, uk: false },
            ],
          },
        },
        { id: "t2", type: "erTable", position: { x: 0, y: 0 }, data: { name: "空", columns: [{ name: "x", type: "", pk: false, uk: false }] } },
      ] as never,
      []
    );
    const snapshot = await readMermaidDiagram(code);
    if (snapshot.kind !== "er") throw new Error(code);
    const { data } = erFromMermaid(snapshot);
    expect(data.nodes.map((n) => [n.name, n.columns.map((c) => `${c.type} ${c.name}`)]), code).toEqual([
      ["注文", ["int id", "List~string~ tags"]],
      ["空", []],
    ]);
  });
});
