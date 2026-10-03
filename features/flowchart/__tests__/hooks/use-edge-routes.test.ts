/**
 * spec 17 D4 (裁定 3 の案 iii): ドラッグ中に使い回せる線の選び方と、線ごとの経路の入れ物
 */
import { describe, expect, test, vi } from "vitest";
import {
  EdgeRouteStore,
  estimateButtonSize,
  reusableEdges,
} from "@/features/flowchart/hooks/use-edge-routes";
import type { EdgeRoute, RouteBox, RouteEdgeInput } from "@/features/flowchart/utils/edge-route";
import type { Point } from "@/features/flowchart/utils/frame-edit";

const box = (id: string, x: number, y: number): RouteBox => ({
  id,
  x,
  y,
  width: 240,
  height: 48,
  frame: false,
  z: 0,
});
const key = (b: RouteBox) =>
  `${b.x},${b.y},${b.width},${b.height},${b.parentId ?? ""},${b.z},${b.frame}`;
const edge = (
  id: string,
  source: string,
  target: string,
  from: Point,
  to: Point
): RouteEdgeInput => ({
  id,
  source,
  target,
  from: { ...from, side: "bottom" },
  to: { ...to, side: "top" },
  button: { width: 101, height: 28 },
});
const edgeKey = (e: RouteEdgeInput) =>
  `${e.source}>${e.target}|${e.from.x},${e.from.y},${e.from.side}|${e.to.x},${e.to.y},${e.to.side}|${e.button.width}`;

describe("reusableEdges (ドラッグ中に使い回せる線)", () => {
  const A = box("A", 0, 0);
  const B = box("B", 0, 200);
  const far = box("far", 2000, 0);
  const ab = edge("A-B", "A", "B", { x: 120, y: 48 }, { x: 120, y: 200 });
  const prevBoxes = new Map([A, B, far].map((b) => [b.id, key(b)]));
  const prevRects = new Map(
    [A, B, far].map((b) => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }])
  );
  const prevEdges = new Map([[ab.id, edgeKey(ab)]]);
  const cache = new Map([[ab.id, null]]);

  test("離れた所のノードが動いただけなら使い回す", () => {
    const moved = { ...far, x: 2100 };
    expect(
      reusableEdges(prevBoxes, [A, B, moved], prevEdges, [ab], cache, prevRects).has("A-B")
    ).toBe(true);
  });

  test("線の範囲にノードが入ってきたら探し直す", () => {
    const moved = { ...far, x: 0, y: 100 };
    expect(
      reusableEdges(prevBoxes, [A, B, moved], prevEdges, [ab], cache, prevRects).has("A-B")
    ).toBe(false);
  });

  test("線の範囲からノードが出ていった時も探し直す (前の矩形で見る)", () => {
    const inside = box("mid", 0, 100);
    const pb = new Map([A, B, inside].map((b) => [b.id, key(b)]));
    const pr = new Map(
      [A, B, inside].map((b) => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }])
    );
    const moved = { ...inside, x: 3000 };
    expect(reusableEdges(pb, [A, B, moved], prevEdges, [ab], cache, pr).has("A-B")).toBe(false);
  });

  test("端が動いた線、前に無かった線は探し直す", () => {
    const movedB = { ...B, x: 10 };
    const ab2 = edge("A-B", "A", "B", { x: 120, y: 48 }, { x: 130, y: 200 });
    expect(
      reusableEdges(prevBoxes, [A, movedB, far], prevEdges, [ab2], cache, prevRects).has("A-B")
    ).toBe(false);
    const other = edge("B-A", "B", "A", { x: 120, y: 248 }, { x: 120, y: 0 });
    expect(
      reusableEdges(prevBoxes, [A, B, far], prevEdges, [ab, other], cache, prevRects).has("B-A")
    ).toBe(false);
  });
});

describe("EdgeRouteStore", () => {
  const route = (x: number): EdgeRoute => ({
    points: [
      { x: 0, y: 0 },
      { x, y: 0 },
    ],
    label: { x: x / 2, y: 0 },
  });

  test("中身が変わらない線は前の値をそのまま持ち、知らせない", () => {
    const store = new EdgeRouteStore();
    store.replace(
      new Map([
        ["a", route(10)],
        ["b", route(20)],
      ])
    );
    const before = store.get("a");
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe("a", a);
    store.subscribe("b", b);
    store.replace(
      new Map([
        ["a", route(10)],
        ["b", route(30)],
      ])
    );
    expect(store.get("a")).toBe(before);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  test("回さなくなった線にも知らせる", () => {
    const store = new EdgeRouteStore();
    store.replace(new Map([["a", route(10)]]));
    const a = vi.fn();
    store.subscribe("a", a);
    store.replace(new Map());
    expect(store.get("a")).toBeUndefined();
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe("estimateButtonSize", () => {
  test("ラベルが空なら 101×28 (P0 の 6)。長いラベルは文字の数だけ伸びる", () => {
    expect(estimateButtonSize("")).toEqual({ width: 101, height: 28 });
    const long = estimateButtonSize("とても長いラベルの文字列がここに入ります");
    expect(long.width).toBeGreaterThan(300);
    expect(long.width).toBeLessThan(360);
  });
});
