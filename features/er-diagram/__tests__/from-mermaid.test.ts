/**
 * spec 11 D1: ER 図の取り込みを mermaid.js の解析の結果から作る。
 * 対応は MCP の経路 (Rust の lorelei_core::editor::to_editor) と同じ。crates/lorelei_core/tests/editor.rs と同じ入力で同じ出力になることを確かめる
 */
import { describe, expect, test, vi } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import { erFromMermaid } from "@/features/er-diagram/utils/from-mermaid";

vi.unmock("@/components/ui/mermaid-render");

async function er(source: string) {
  const snapshot = await readMermaidDiagram(source);
  if (snapshot.kind !== "er") throw new Error(`not er: ${snapshot.kind}`);
  return erFromMermaid(snapshot);
}
const d = (construct: string, count: number) => ({ construct, count });

describe("erFromMermaid", () => {
  test("フォーク元が出す 7 つの多重度はそのまま戻る", async () => {
    for (const [symbol, expected] of [
      ["||--||", "one-to-one"],
      ["||--o{", "one-to-many"],
      ["}o--||", "many-to-one"],
      ["}o--o{", "many-to-many"],
      ["o|--||", "zero-to-one"],
      ["||--o|", "one-to-zero"],
      ["||--|{", "one-to-many-mandatory"],
    ]) {
      const r = await er(`erDiagram\n  A ${symbol} B : r\n`);
      expect(r.data.edges[0].data, symbol).toMatchObject({ cardinality: expected });
      expect([r.data.edges[0].source, r.data.edges[0].target]).toEqual(["A", "B"]);
      expect(r.dropped, symbol).toEqual([]);
    }
  });

  test("エディタに無い多重度と非識別は、近いものにして知らせる", async () => {
    const r = await er("erDiagram\n  A |o..|{ B : r\n");
    expect(r.data.edges[0].data).toMatchObject({ cardinality: "one-to-many" });
    expect(r.dropped).toEqual([d("cardinality_unsupported", 1), d("non_identifying", 1)]);
  });

  test("日本語の列名 ・ キー ・ テーブルの順が保たれ、列の注釈は知らせる", async () => {
    const r = await er(
      'erDiagram\n  顧客 ||--o{ 注文 : "行う"\n  顧客 {\n    int id PK "主キー"\n    string 氏名 UK\n    int 会社_id FK\n  }\n  注文 {\n    date 注文日\n  }\n'
    );
    expect(r.data.nodes.map((n) => n.name)).toEqual(["顧客", "注文"]);
    expect(r.data.nodes[0].columns.map((c) => [c.type, c.name, c.pk, c.uk, c.fk ?? false])).toEqual([
      ["int", "id", true, false, false],
      ["string", "氏名", false, true, false],
      ["int", "会社_id", false, false, true],
    ]);
    expect(r.data.nodes[1].columns[0].name).toBe("注文日");
    expect(r.data.edges[0].data).toMatchObject({ label: "行う" });
    expect(r.dropped).toEqual([d("attribute_comment", 1)]);
  });

  test("別名ではなく識別子を名前にし、別名 ・ class ・ style を知らせ、向きを写す", async () => {
    const r = await er(
      'erDiagram\n  direction LR\n  A["顧客"] {\n    int id\n  }\n  A ||--o{ B : has\n  classDef hot fill:#f00\n  class A hot\n  style B fill:#0f0\n'
    );
    expect(r.data.nodes[0].name).toBe("A");
    expect(r.dropped).toEqual([d("alias", 1), d("class", 1), d("classDef", 1), d("style", 1)]);
    expect(r.data.direction).toBe("LR");
  });

  test("キーは順を問わない", async () => {
    const r = await er("erDiagram\n  注文 {\n    int 顧客_id PK, FK\n    int 店_id FK, PK\n    string 番号 UK, FK\n  }\n");
    expect(r.data.nodes[0].columns.map((c) => [c.pk, c.uk, c.fk ?? false])).toEqual([
      [true, false, true],
      [true, false, true],
      [false, true, true],
    ]);
    expect(r.dropped).toEqual([]);
    expect(r.data.direction).toBeUndefined();
  });

  test("subgraph はテーブルにせず、それを指す関係を落として知らせる (rev1、査読 2)", async () => {
    const r = await er("erDiagram\n  subgraph G[グループ]\n    A\n  end\n  B ||--o{ G : r\n  A ||--o{ B : s\n");
    expect(r.data.nodes.map((n) => n.name)).toEqual(["A", "B"]);
    expect(r.data.edges.map((e) => [e.source, e.target])).toEqual([["A", "B"]]);
    expect(r.dropped).toEqual([d("edge_to_subgraph", 1), d("subgraph", 1)]);
  });

  // spec 12 D2: フォーク元のパーサーのテストにだけあった入力の種類
  test("ハイフンを含むテーブル名 ・ 括弧を含む型 ・ 同じテーブルの間の複数の関係", async () => {
    const r = await er(
      "erDiagram\n  ORDER ||--|{ LINE-ITEM : contains\n  ORDER ||--o{ LINE-ITEM : returns\n  LINE-ITEM {\n    varchar(255) productCode\n    int quantity\n  }\n"
    );
    expect(r.data.nodes.map((n) => n.name)).toEqual(["ORDER", "LINE-ITEM"]);
    expect(r.data.nodes[1].columns.map((c) => [c.type, c.name])).toEqual([
      ["varchar(255)", "productCode"],
      ["int", "quantity"],
    ]);
    expect(r.data.edges.map((e) => [e.id, e.source, e.target, e.data?.label, e.data?.cardinality])).toEqual([
      ["edge-0", "ORDER", "LINE-ITEM", "contains", "one-to-many-mandatory"],
      ["edge-1", "ORDER", "LINE-ITEM", "returns", "one-to-many"],
    ]);
    expect(r.dropped).toEqual([]);
  });

  test("線はエディタの形 (erEdge ・ edge-N)", async () => {
    const r = await er("erDiagram\n  A ||--o{ B : has\n  B ||--|| C : is\n");
    expect(r.data.edges.map((e) => [e.id, e.type])).toEqual([
      ["edge-0", "erEdge"],
      ["edge-1", "erEdge"],
    ]);
  });
});
