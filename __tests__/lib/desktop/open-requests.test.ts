import { describe, expect, it } from "vitest";
import type { OpenRequest } from "@/lib/desktop/open-requests";
import { describeDropped, partitionOpens, routeOf } from "@/lib/desktop/open-requests";

const req = (editor: "flowchart" | "erDiagram" | null, error?: string): OpenRequest => ({
  source: "",
  payload: editor ? { editor, data: {}, dropped: [] } : null,
  dropped: [],
  error: error ?? null,
});

describe("partitionOpens", () => {
  it("このページ宛て・別ページ宛て・失敗に分ける", () => {
    const a = req("flowchart");
    const b = req("erDiagram");
    const c = req(null, "文法エラー");
    const d = req("flowchart");
    const { mine, others, failed } = partitionOpens([a, b, c, d], "flowchart");
    expect(mine).toEqual([a, d]);
    expect(others).toEqual([b]);
    expect(failed).toEqual([c]);
  });
});

describe("routeOf", () => {
  it("trailingSlash に合わせたページのパスを返す", () => {
    expect(routeOf("flowchart")).toBe("/");
    expect(routeOf("erDiagram")).toBe("/er-diagram/");
  });
});

describe("describeDropped", () => {
  it("既知の要素は日本語、形・矢印・向きは詳細つきで並べる", () => {
    expect(
      describeDropped([
        { construct: "subgraph", count: 2 },
        { construct: "shape:cylinder", count: 1 },
        { construct: "edge:---", count: 3 },
        { construct: "direction:LR", count: 1 },
      ])
    ).toBe("サブグラフ ×2、形 cylinder ×1、矢印 --- ×3、向き LR ×1");
  });

  it("知らない要素名はそのまま出す (黙って消さない)", () => {
    expect(describeDropped([{ construct: "future_thing", count: 1 }])).toBe("future_thing ×1");
  });
});
