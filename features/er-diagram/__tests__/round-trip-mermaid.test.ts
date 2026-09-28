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
