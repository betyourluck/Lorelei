/**
 * spec 15 D3: 枠のある図の取り込み時の配置 (今の段組みを入れ子に使う, 裁定 1)
 */
import { describe, expect, test } from "vitest";
import type { ParsedMermaidData } from "@/features/flowchart/hooks/mermaid";
import type { GraphType } from "@/features/flowchart/types/types";
import {
  layoutNested,
  levelsOf,
  MIN_GAP,
  type NestedLayoutMetrics,
} from "@/features/flowchart/utils/nested-layout";

const METRICS: NestedLayoutMetrics = {
  node: { width: 240, height: 48 },
  pitchAlong: 150,
  pitchAcross: 250,
  start: 50,
  center: 300,
  padding: 24,
  titleHeight: 28,
};

const data = (
  nodes: string[],
  edges: [string, string][],
  subgraphs: ParsedMermaidData["subgraphs"]
): ParsedMermaidData => ({
  nodes: nodes.map((id) => ({ id, variableName: id, label: id, shapeType: "rectangle" })),
  edges: edges.map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
    label: "",
    arrowType: "arrow",
  })),
  subgraphs,
});

type Box = { x: number; y: number; width: number; height: number };

/** 絶対位置の矩形 (親の位置を根まで足す) */
function boxes(d: ParsedMermaidData, direction: GraphType = "TD"): Map<string, Box> {
  const { positions, frameSizes } = layoutNested(d, direction, METRICS);
  const parentOf = new Map<string, string>();
  (d.subgraphs ?? []).forEach((f) => {
    if (f.parent) parentOf.set(f.id, f.parent);
    f.nodes.forEach((n) => parentOf.set(n, f.id));
  });
  const abs = (id: string): { x: number; y: number } => {
    const p = positions.get(id)!;
    const parent = parentOf.get(id);
    if (!parent) return p;
    const q = abs(parent);
    return { x: p.x + q.x, y: p.y + q.y };
  };
  const out = new Map<string, Box>();
  positions.forEach((_, id) =>
    out.set(id, { ...abs(id), ...(frameSizes.get(id) ?? METRICS.node) })
  );
  return out;
}

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("layoutNested", () => {
  const nestedData = data(
    ["A", "B", "C", "D"],
    [
      ["A", "B"],
      ["B", "C"],
      ["C", "D"],
    ],
    [
      { id: "O", title: "外", nodes: ["B"] },
      { id: "I", title: "内", nodes: ["A"], parent: "O" },
      { id: "Q", title: "別", nodes: ["C"] },
    ]
  );

  test.each(["TD", "LR", "BT", "RL"] as GraphType[])(
    "%s: 中身は枠の内側に収まり、同じ枠の中のものは重ならない",
    (direction) => {
      const b = boxes(nestedData, direction);
      expect(inside(b.get("I")!, b.get("O")!)).toBe(true);
      expect(inside(b.get("A")!, b.get("I")!)).toBe(true);
      expect(inside(b.get("B")!, b.get("O")!)).toBe(true);
      expect(inside(b.get("C")!, b.get("Q")!)).toBe(true);
      expect(overlap(b.get("I")!, b.get("B")!)).toBe(false);
      for (const [x, y] of [
        ["O", "Q"],
        ["O", "D"],
        ["Q", "D"],
      ])
        expect(overlap(b.get(x)!, b.get(y)!), `${x} と ${y}`).toBe(false);
    }
  );

  test("枠をまたぐ線で枠どうしの段が決まる (TD は上から、BT は下から)", () => {
    const td = boxes(nestedData, "TD");
    expect(td.get("Q")!.y).toBeGreaterThanOrEqual(td.get("O")!.y + td.get("O")!.height + MIN_GAP);
    expect(td.get("D")!.y).toBeGreaterThanOrEqual(td.get("Q")!.y + td.get("Q")!.height);
    const bt = boxes(nestedData, "BT");
    expect(bt.get("O")!.y).toBeGreaterThanOrEqual(bt.get("Q")!.y + bt.get("Q")!.height);
    const lr = boxes(nestedData, "LR");
    expect(lr.get("Q")!.x).toBeGreaterThanOrEqual(lr.get("O")!.x + lr.get("O")!.width);
  });

  test("枠の中は左上から余白と見出しの分だけ下げる", () => {
    const { positions, frameSizes } = layoutNested(
      data(["A"], [], [{ id: "S", title: "s", nodes: ["A"] }]),
      "TD",
      METRICS
    );
    expect(positions.get("A")).toEqual({ x: 24, y: 52 });
    expect(frameSizes.get("S")).toEqual({ width: 240 + 48, height: 48 + 52 + 24 });
  });

  test("空の枠はノード 1 つ分の中身の大きさ", () => {
    const { frameSizes } = layoutNested(
      data([], [], [{ id: "E", title: "", nodes: [] }]),
      "TD",
      METRICS
    );
    expect(frameSizes.get("E")).toEqual({ width: 240 + 48, height: 48 + 52 + 24 });
  });
});

describe("levelsOf (今の段組みと同じ段の数え方)", () => {
  test("入る線の無いものが 0 段、輪は止まる", () => {
    const levels = levelsOf(
      ["A", "B", "C"],
      [
        ["A", "B"],
        ["B", "C"],
        ["C", "B"],
      ]
    );
    expect(Object.fromEntries(levels)).toEqual({ A: 0, B: 1, C: 2 });
  });
});
