/**
 * spec 24: ER 図のテーマを出力 (生成するコード) に書き、取り込みで読み戻す。本物の mermaid を使う
 */
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import type { ERTableNodeProps } from "../components/node/er-table-node";
import { generateERDiagramMermaidCode } from "../utils/generate-mermaid-code";
import { readErForImport } from "../utils/import-er";

vi.unmock("@/components/ui/mermaid-render");

const table = (id: string, name: string): Node<ERTableNodeProps> => ({
  id,
  type: "erTable",
  position: { x: 0, y: 0 },
  data: {
    name,
    columns: [{ name: "id", type: "int", pk: true, uk: false }],
    onNameChange: () => {},
    onColumnsChange: () => {},
  },
});
const nodes = [table("1", "USER"), table("2", "ORDER")];
const edges: Edge[] = [
  {
    id: "e",
    type: "erEdge",
    source: "1",
    target: "2",
    data: { label: "places", cardinality: "one-to-many" },
  },
];

describe("ER 図のテーマ (spec 24)", () => {
  test("default 以外のテーマは、図の先頭に frontmatter で書く。default は何も書かない", () => {
    const before = generateERDiagramMermaidCode(nodes, edges, "LR");
    expect(before.startsWith("erDiagram\n  direction LR\n")).toBe(true);
    expect(generateERDiagramMermaidCode(nodes, edges, "LR", "default")).toBe(before);
    expect(generateERDiagramMermaidCode(nodes, edges, "LR", "forest")).toBe(
      `---\nconfig:\n  theme: forest\n---\n${before}`
    );
  });

  test("取り込みは frontmatter と init のテーマを読み、テーマ以外の設定は消えるものに出す", async () => {
    const body = "erDiagram\n  USER ||--o{ ORDER : places\n";
    const front = await readErForImport(
      `---\nconfig:\n  theme: dark\n  er:\n    layoutDirection: LR\n---\n${body}`
    );
    expect(front.ok).toBe(true);
    if (!front.ok) return;
    expect(front.data.theme).toBe("dark");
    expect(front.dropped).toEqual([{ construct: "config:er", count: 1 }]);

    const init = await readErForImport(`%%{init: {"theme": "neutral"}}%%\n${body}`);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    expect(init.data.theme).toBe("neutral");
  });

  test("生成したコードを取り込むと、同じテーマに戻る", async () => {
    for (const theme of ["neutral", "dark", "forest"] as const) {
      const r = await readErForImport(generateERDiagramMermaidCode(nodes, edges, "TD", theme));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.theme).toBe(theme);
      expect(r.data.nodes.map((n) => n.name)).toEqual(["USER", "ORDER"]);
    }
  });
});
