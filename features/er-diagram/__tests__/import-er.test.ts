/**
 * spec 11 D3: ER 図のインポートが使う読み取り。本物の mermaid を使う
 */
import { describe, expect, test, vi } from "vitest";
import { readErForImport } from "@/features/er-diagram/utils/import-er";

vi.unmock("@/components/ui/mermaid-render");

describe("readErForImport", () => {
  test("取り込みの形と、消えるものを返す (日本語の列名も取り込む)", async () => {
    const r = await readErForImport('erDiagram\n  顧客 {\n    int id PK "主キー"\n    string 名前\n  }\n  顧客 ||--o{ 注文 : 行う\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes[0].columns.map((c) => c.name)).toEqual(["id", "名前"]);
    expect(r.dropped).toEqual([{ construct: "attribute_comment", count: 1 }]);
  });

  test("文法の誤りは取り込まずに理由を出す", async () => {
    const r = await readErForImport("erDiagram\n  顧客 ||--o{ 注文\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^Mermaid の文法の誤りで取り込めません（2 行目）/);
  });

  test("フローチャートなどほかの図は取り込まない", async () => {
    expect(await readErForImport("flowchart TD\n  A --> B\n")).toEqual({
      ok: false,
      error: "ER 図ではありません（flowchart などはそれぞれのエディタのインポートで取り込んでください）",
    });
  });
});
