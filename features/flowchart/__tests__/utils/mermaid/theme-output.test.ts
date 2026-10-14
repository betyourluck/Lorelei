/**
 * spec 24: フローチャートのテーマを出力 (生成するコード) に書き、取り込みで読み戻す。本物の mermaid を使う
 */
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { describeDropped } from "@/components/ui/mermaid-dropped";
import { generateMermaidCode } from "@/features/flowchart/hooks/mermaid";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";

vi.unmock("@/components/ui/mermaid-render");

const nodes: Node[] = [
  {
    id: "A",
    type: "editableNode",
    position: { x: 0, y: 0 },
    data: { label: "開始", variableName: "A", shapeType: "rectangle" },
  },
  {
    id: "B",
    type: "editableNode",
    position: { x: 0, y: 100 },
    data: { label: "判定", variableName: "B", shapeType: "diamond" },
  },
];
const edges: Edge[] = [
  { id: "A-B", source: "A", target: "B", data: { label: "", arrowType: "arrow" } },
];
const flow = { nodes, edges };
const BODY = "flowchart LR\n  A[開始] --> B{判定}\n";

describe("フローチャートのテーマ (spec 24)", () => {
  test("default 以外のテーマは、図の先頭に frontmatter で書く", () => {
    const code = generateMermaidCode(flow, "LR", "dark");
    expect(code.startsWith("---\nconfig:\n  theme: dark\n---\nflowchart LR\n")).toBe(true);
    // テーマの後ろは、テーマの無いコードと同じ
    expect(code).toBe(`---\nconfig:\n  theme: dark\n---\n${generateMermaidCode(flow, "LR")}`);
  });

  test("default か、テーマを渡さない時は何も書かない (今までの出力と同じ)", () => {
    const before = generateMermaidCode(flow, "LR");
    expect(before.startsWith("flowchart LR\n")).toBe(true);
    expect(generateMermaidCode(flow, "LR", "default")).toBe(before);
  });

  test("取り込みは frontmatter のテーマを読む", async () => {
    const r = await readFlowchartForImport(`---\nconfig:\n  theme: forest\n---\n${BODY}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.theme).toBe("forest");
    expect(r.dropped).toEqual([]);
  });

  test("取り込みは init のテーマも読む", async () => {
    const r = await readFlowchartForImport(`%%{init: {"theme": "neutral"}}%%\n${BODY}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.theme).toBe("neutral");
  });

  test("default と書いた図・テーマを書かない図は、テーマを持たない", async () => {
    for (const code of [`---\nconfig:\n  theme: default\n---\n${BODY}`, BODY]) {
      const r = await readFlowchartForImport(code);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.theme).toBeUndefined();
      expect(r.dropped).toEqual([]);
    }
  });

  test("テーマ以外の設定と、選べないテーマは、消えるものに出す (今までは黙って消えた)", async () => {
    const r = await readFlowchartForImport(
      `---\nconfig:\n  theme: dark\n  themeVariables:\n    primaryColor: "#6A7FAB"\n  flowchart:\n    rankSpacing: 100\n---\n${BODY}`
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.theme).toBe("dark");
    expect(r.dropped).toEqual([
      { construct: "config:flowchart", count: 1 },
      { construct: "config:themeVariables", count: 1 },
    ]);
    expect(describeDropped(r.dropped)).toBe("設定 flowchart ×1、設定 themeVariables ×1");

    const base = await readFlowchartForImport(`%%{init: {"theme": "base"}}%%\n${BODY}`);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.data.theme).toBeUndefined();
    expect(base.dropped).toEqual([{ construct: "theme:base", count: 1 }]);
    expect(describeDropped(base.dropped)).toBe("テーマ base（選べないテーマ） ×1");
  });

  test("生成したコードを取り込むと、同じテーマに戻る", async () => {
    for (const theme of ["neutral", "dark", "forest"] as const) {
      const r = await readFlowchartForImport(generateMermaidCode(flow, "LR", theme));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.theme).toBe(theme);
      expect(r.data.direction).toBe("LR");
      expect(r.data.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    }
  });
});
