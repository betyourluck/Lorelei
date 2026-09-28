/**
 * spec 11 D2・D3: インポートが使う読み取り。本物の mermaid を使う
 */
import { describe, expect, test, vi } from "vitest";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";

vi.unmock("@/components/ui/mermaid-render");

describe("readFlowchartForImport", () => {
  test("取り込みの形と、消えるものを返す", async () => {
    const r = await readFlowchartForImport("flowchart LR\n  A[a] --> B[b]\n  style A fill:#f00\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(r.data.direction).toBe("LR");
    expect(r.dropped).toEqual([{ construct: "style", count: 1 }]);
  });

  test("見出しの無いコードは flowchart TD を補って読む (フォーク元と同じ)", async () => {
    const r = await readFlowchartForImport("A[開始] --> B[終了]\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges.map((e) => [e.source, e.target])).toEqual([["A", "B"]]);
  });

  test("見出しを補った時も、誤りの行は本文の行で言う", async () => {
    const r = await readFlowchartForImport("A --> B\nB --> --> C\n");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("（2 行目）") });
  });

  test("文法の誤りは取り込まずに理由を出す", async () => {
    const r = await readFlowchartForImport("flowchart TD\n  A --> B\n  B --> --> C\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^Mermaid の文法の誤りで取り込めません（3 行目）/);
    expect(r.error).toContain("Parse error on line 3");
  });

  test("ER 図などほかの図は取り込まない", async () => {
    expect(await readFlowchartForImport("erDiagram\n  A ||--o{ B : r\n")).toEqual({
      ok: false,
      error: "フローチャートではありません（erDiagram などはそれぞれのエディタのインポートで取り込んでください）",
    });
    expect((await readFlowchartForImport("sequenceDiagram\n  A->>B: hi\n")).ok).toBe(false);
  });
});
