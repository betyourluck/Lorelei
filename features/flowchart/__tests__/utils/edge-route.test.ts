/**
 * spec 17: 枠をまたぐ線を、途中の枠・ノードの外へ回す (routeEdges)。
 * 図の座標は P0 の 1 で Web 版の画面から測ったもの (TD の a・f) と、それを向きごとに写したもの
 */
import { describe, expect, test } from "vitest";
import {
  bezierPolyline,
  ROUTE,
  routeEdges,
  type EdgeRoute,
  type RouteBox,
  type RouteEdgeInput,
  type RouteEnd,
} from "@/features/flowchart/utils/edge-route";
import type { HandleSide, Point } from "@/features/flowchart/utils/frame-edit";

const BUTTON = { width: 101, height: 28 };
const HEADER = 28;

const box = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string,
  frame = false
): RouteBox => ({
  id,
  x,
  y,
  width,
  height,
  frame,
  ...(parentId ? { parentId } : {}),
});
const frameBox = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string
) => box(id, x, y, width, height, parentId, true);

/** 入れ物の向きが TD の時の接続点 (出口は下の辺の中央、入口は上の辺の中央) */
const tdEdge = (boxes: RouteBox[], source: string, target: string): RouteEdgeInput => {
  const s = boxes.find((b) => b.id === source)!;
  const t = boxes.find((b) => b.id === target)!;
  return {
    id: `${source}-${target}`,
    source,
    target,
    from: { x: s.x + s.width / 2, y: s.y + s.height, side: "bottom" },
    to: { x: t.x + t.width / 2, y: t.y, side: "top" },
    button: BUTTON,
  };
};

/** P0 の 1 の a (TD): 開始 → 利用者 → 受付 → 審査 → 通知 → 利用者へ戻る */
const caseA = (): RouteBox[] => [
  frameBox("R", 156, 350, 288, 274),
  frameBox("S", 156, 726, 288, 274),
  frameBox("N", 156, 1102, 288, 124),
  box("Z", 180, 50, 240, 48),
  box("U", 180, 200, 240, 48),
  box("A", 180, 402, 240, 48, "R"),
  box("B", 180, 552, 240, 48, "R"),
  box("C", 180, 778, 240, 48, "S"),
  box("D", 180, 928, 240, 48, "S"),
  box("E", 180, 1154, 240, 48, "N"),
];
const edgesA = (boxes: RouteBox[]) => [
  tdEdge(boxes, "A", "B"),
  tdEdge(boxes, "C", "D"),
  tdEdge(boxes, "Z", "U"),
  tdEdge(boxes, "U", "R"),
  tdEdge(boxes, "R", "S"),
  tdEdge(boxes, "S", "N"),
  tdEdge(boxes, "N", "U"),
];

/** P0 の 1 の f (TD): 「下段」の中の「左」から上へ戻る。「左」の横に「右」、間に「中段」 */
const caseF = (): RouteBox[] => [
  frameBox("M", 156, 350, 288, 124),
  frameBox("F", 21, 576, 558, 274),
  box("Z", 180, 50, 240, 48),
  box("T", 180, 200, 240, 48),
  box("m1", 180, 402, 240, 48, "M"),
  box("f0", 180, 628, 240, 48, "F"),
  box("f1", 45, 778, 240, 48, "F"),
  box("f2", 315, 778, 240, 48, "F"),
];
const edgesF = (boxes: RouteBox[]) => [
  tdEdge(boxes, "f0", "f1"),
  tdEdge(boxes, "f0", "f2"),
  tdEdge(boxes, "Z", "T"),
  tdEdge(boxes, "T", "M"),
  tdEdge(boxes, "M", "F"),
  tdEdge(boxes, "f1", "T"),
];

/** TD の図を BT・LR・RL へ写す (接続点の向きも写す) */
type Dir = "TD" | "BT" | "LR" | "RL";
const SIDE_MAP: Record<Dir, Record<HandleSide, HandleSide>> = {
  TD: { top: "top", bottom: "bottom", left: "left", right: "right" },
  BT: { top: "bottom", bottom: "top", left: "left", right: "right" },
  LR: { top: "left", bottom: "right", left: "top", right: "bottom" },
  RL: { top: "right", bottom: "left", left: "top", right: "bottom" },
};
const mapPoint = (dir: Dir, p: Point): Point =>
  dir === "TD"
    ? p
    : dir === "BT"
      ? { x: p.x, y: -p.y }
      : dir === "LR"
        ? { x: p.y, y: p.x }
        : { x: -p.y, y: p.x };
const mapBox = (dir: Dir, b: RouteBox): RouteBox => {
  const a = mapPoint(dir, { x: b.x, y: b.y });
  const c = mapPoint(dir, { x: b.x + b.width, y: b.y + b.height });
  return {
    ...b,
    x: Math.min(a.x, c.x),
    y: Math.min(a.y, c.y),
    width: Math.abs(c.x - a.x),
    height: Math.abs(c.y - a.y),
  };
};
const mapEdge = (dir: Dir, e: RouteEdgeInput): RouteEdgeInput => ({
  ...e,
  from: { ...mapPoint(dir, e.from), side: SIDE_MAP[dir][e.from.side] },
  to: { ...mapPoint(dir, e.to), side: SIDE_MAP[dir][e.to.side] },
});

// ---- 確かめる道具 ----

const EPS = 1e-6;
/** 線分が矩形の内側 (縁は含まない) を通るか */
function segmentEntersRect(
  a: Point,
  b: Point,
  r: { x: number; y: number; width: number; height: number }
): boolean {
  const x1 = Math.min(a.x, b.x),
    x2 = Math.max(a.x, b.x),
    y1 = Math.min(a.y, b.y),
    y2 = Math.max(a.y, b.y);
  return x2 > r.x + EPS && x1 < r.x + r.width - EPS && y2 > r.y + EPS && y1 < r.y + r.height - EPS;
}
const pathEnters = (pts: Point[], r: { x: number; y: number; width: number; height: number }) =>
  pts.some((p, i) => i > 0 && segmentEntersRect(pts[i - 1], p, r));

const ancestorsOf = (boxes: RouteBox[], id: string): Set<string> => {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const out = new Set<string>();
  for (let p = byId.get(id)?.parentId; p !== undefined && !out.has(p); p = byId.get(p)?.parentId)
    out.add(p);
  return out;
};

/** 回した道筋の決まりごと (受け入れ条件 1・2、D2) をまとめて確かめる */
function expectValidRoute(boxes: RouteBox[], e: RouteEdgeInput, route: EdgeRoute | undefined) {
  expect(route, `${e.id} を回す`).toBeDefined();
  const pts = route!.points;
  expect(pts[0]).toEqual({ x: e.from.x, y: e.from.y });
  expect(pts[pts.length - 1]).toEqual({ x: e.to.x, y: e.to.y });
  // 縦と横の線分だけ・折り返さない
  const dirs = pts.slice(1).map((p, i) => {
    const q = pts[i];
    expect(p.x === q.x || p.y === q.y, `${e.id} の線分 ${i} は縦か横`).toBe(true);
    return { x: Math.sign(p.x - q.x) || 0, y: Math.sign(p.y - q.y) || 0 };
  });
  dirs.forEach((d, i) => {
    if (i > 0)
      expect(
        d.x === -dirs[i - 1].x && d.y === -dirs[i - 1].y,
        `${e.id} は線分 ${i} で折り返さない`
      ).toBe(false);
  });
  // 出口から接続点の向きへ出て、入口へは接続点の向きの反対から入る
  const out: Record<HandleSide, Point> = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  expect(dirs[0]).toEqual(out[e.from.side]);
  const inDir = out[e.to.side];
  expect(dirs[dirs.length - 1]).toEqual({ x: -inDir.x || 0, y: -inDir.y || 0 });
  // 障害物 (どちらの端も中にいない枠・ノード) と端そのものを通らない
  const pass = new Set(
    Array.from(ancestorsOf(boxes, e.source)).concat(Array.from(ancestorsOf(boxes, e.target)))
  );
  for (const b of boxes) {
    if (pass.has(b.id)) continue;
    expect(pathEnters(pts, b), `${e.id} は ${b.id} を通らない`).toBe(false);
  }
  // 通れる枠の見出しの帯を通らない。枠の縁に MARGIN 未満で沿って走らない (縁と線が重なって見える, P1 の画面の f)
  for (const id of Array.from(pass)) {
    const f = boxes.find((b) => b.id === id)!;
    expect(
      pathEnters(pts, { x: f.x, y: f.y, width: f.width, height: HEADER }),
      `${e.id} は ${id} の見出しを通らない`
    ).toBe(false);
    pts.slice(1).forEach((p, i) => {
      const q = pts[i];
      const horizontal = p.y === q.y;
      const along = horizontal ? [f.y, f.y + f.height] : [f.x, f.x + f.width];
      const at = horizontal ? p.y : p.x;
      const [lo, hi] = horizontal
        ? [Math.min(p.x, q.x), Math.max(p.x, q.x)]
        : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
      const [elo, ehi] = horizontal ? [f.x, f.x + f.width] : [f.y, f.y + f.height];
      const overlapLen = Math.min(hi, ehi) - Math.max(lo, elo);
      for (const border of along) {
        const hugs = Math.abs(at - border) < ROUTE.MARGIN - EPS && overlapLen > ROUTE.MARGIN;
        expect(hugs, `${e.id} の線分 ${i} は ${id} の縁に沿わない`).toBe(false);
      }
    });
  }
  // ボタンが障害物と端に重ならない
  const btn = {
    x: route!.label.x - e.button.width / 2,
    y: route!.label.y - e.button.height / 2,
    width: e.button.width,
    height: e.button.height,
  };
  for (const b of boxes) {
    if (pass.has(b.id)) continue;
    const overlap =
      btn.x < b.x + b.width &&
      btn.x + btn.width > b.x &&
      btn.y < b.y + b.height &&
      btn.y + btn.height > b.y;
    expect(overlap, `${e.id} のボタンは ${b.id} に重ならない`).toBe(false);
  }
}

// ---- テスト ----

describe("routeEdges: どの線を回すか (裁定 1)", () => {
  test("a: 下の枠から上のノードへ戻る線だけを回す。ほかの線は回さない", () => {
    const boxes = caseA();
    const routes = routeEdges(boxes, edgesA(boxes));
    expect(Array.from(routes.keys())).toEqual(["N-U"]);
  });

  test("枠の無い図の戻る線も、間のノードを貫けば回す (spec 19 裁定 1。spec 17 では回さなかった)", () => {
    const boxes = [
      box("Z", 0, 0, 240, 48),
      box("A1", 0, 150, 240, 48),
      box("A2", 0, 300, 240, 48),
      box("A3", 0, 450, 240, 48),
    ];
    const edges = [
      tdEdge(boxes, "Z", "A1"),
      tdEdge(boxes, "A1", "A2"),
      tdEdge(boxes, "A2", "A3"),
      tdEdge(boxes, "A3", "A1"),
    ];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["A3-A1"]);
    expectValidRoute(boxes, edges[3], routes.get("A3-A1"));
  });

  test("同じ枠の中の戻る線も、同じ高さのノードを貫けば回す (spec 19 裁定 1。spec 17 では回さなかった)", () => {
    const boxes = [
      frameBox("P", 0, 0, 288, 500),
      box("p1", 24, 52, 240, 48, "P"),
      box("p2", 24, 202, 240, 48, "P"),
      box("p3", 24, 352, 240, 48, "P"),
    ];
    const edges = [tdEdge(boxes, "p1", "p2"), tdEdge(boxes, "p2", "p3"), tdEdge(boxes, "p3", "p1")];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["p3-p1"]);
    expectValidRoute(boxes, edges[2], routes.get("p3-p1"));
  });

  test("枠の中から出る線は、図の直下のノード (線より低い) を貫く時に回す", () => {
    const boxes = [
      box("Z", 24, 0, 240, 48),
      box("U", 24, 150, 240, 48),
      frameBox("N", 0, 300, 288, 124),
      box("E", 24, 352, 240, 48, "N"),
    ];
    const edges = [tdEdge(boxes, "Z", "U"), tdEdge(boxes, "U", "N"), tdEdge(boxes, "E", "Z")];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["E-Z"]);
    expectValidRoute(boxes, edges[2], routes.get("E-Z"));
  });

  test("端である枠の内側を貫く戻る線も回す (間に何も無くても)", () => {
    const boxes = [
      box("U", 24, 0, 240, 48),
      frameBox("N", 0, 150, 288, 124),
      box("E", 24, 202, 240, 48, "N"),
    ];
    const edges = [tdEdge(boxes, "U", "N"), tdEdge(boxes, "N", "U")];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["N-U"]);
    expectValidRoute(boxes, edges[1], routes.get("N-U"));
  });

  test("曲線は枠を横切らなくても、曲線の中点のボタンが枠に重なる線は回す (P1 の画面の LR の e)", () => {
    // Web 版の画面で測った座標 (LR: 出口は右の辺、入口は左の辺)。下 → 上 の曲線は「中段」の 13px 上を通り、ボタン (高さ 28) が中段にかかる
    const boxes = [
      frameBox("M", 950, 238, 288, 124),
      box("Z", 50, 276, 240, 48),
      box("T", 500, 201, 240, 48),
      box("V", 500, 351, 240, 48),
      box("m1", 974, 290, 240, 48, "M"),
      box("B1", 1448, 201, 240, 48),
      box("B2", 1448, 351, 240, 48),
    ];
    const lr = (source: string, target: string, from: Point, to: Point): RouteEdgeInput => ({
      id: `${source}-${target}`,
      source,
      target,
      from: { ...from, side: "right" },
      to: { ...to, side: "left" },
      button: BUTTON,
    });
    const edges = [
      lr("Z", "T", { x: 293, y: 300 }, { x: 497, y: 225 }),
      lr("Z", "V", { x: 293, y: 300 }, { x: 497, y: 375 }),
      lr("T", "M", { x: 743, y: 225 }, { x: 948, y: 300 }),
      lr("V", "M", { x: 743, y: 375 }, { x: 948, y: 300 }),
      lr("M", "B1", { x: 1240, y: 300 }, { x: 1445, y: 225 }),
      lr("M", "B2", { x: 1240, y: 300 }, { x: 1445, y: 375 }),
      lr("B1", "T", { x: 1691, y: 225 }, { x: 497, y: 225 }),
    ];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["B1-T"]);
    expectValidRoute(boxes, edges[6], routes.get("B1-T"));
  });

  test("枠の自己ループは回さない (frameSelfLoopPath のまま)", () => {
    const boxes = caseA();
    const s = boxes.find((b) => b.id === "S")!;
    const loop: RouteEdgeInput = {
      id: "S-S",
      source: "S",
      target: "S",
      from: { x: s.x + s.width / 2, y: s.y + s.height, side: "bottom" },
      to: { x: s.x + s.width / 2, y: s.y, side: "top" },
      button: BUTTON,
    };
    expect(routeEdges(boxes, [loop]).size).toBe(0);
  });
});

/** ボタンの矩形 (中心と大きさから) */
const buttonRect = (c: Point, size: { width: number; height: number }) => ({
  x: c.x - size.width / 2,
  y: c.y - size.height / 2,
  width: size.width,
  height: size.height,
});
const rectsMeet = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
/** 回さない線のボタンの位置 (線の部品と同じ: getBezierPath の中点 + labelOffset) */
const curveButton = (e: RouteEdgeInput) => {
  const pts = bezierPolyline(e.from, e.to);
  const mid = pts[Math.floor(pts.length / 2)];
  return buttonRect(
    { x: mid.x + (e.labelOffset?.x ?? 0), y: mid.y + (e.labelOffset?.y ?? 0) },
    e.button
  );
};
/** 回した線のボタンが、回さない線のボタンと重ならない (D3 の案 A') */
function expectButtonsApart(edges: RouteEdgeInput[], routes: Map<string, EdgeRoute>) {
  for (const [id, r] of Array.from(routes)) {
    const e = edges.find((x) => x.id === id)!;
    const b = buttonRect(r.label, e.button);
    for (const u of edges) {
      if (routes.has(u.id) || u.source === u.target) continue;
      expect(rectsMeet(b, curveButton(u)), `${id} のボタンは ${u.id} のボタンに重ならない`).toBe(
        false
      );
    }
  }
}

describe("routeEdges: 枠の無い図・同じ高さのノード (spec 19 裁定 1 の案 A・裁定 2 の案 C・D3 の案 A')", () => {
  /**
   * 枠の無い図を、取り込みと同じ配置で縦一列 (TD・BT) か横一列 (LR・RL) に並べる (ノード 240×48、段の送りは TD・BT 150、LR・RL 450)。
   * TD の図を回して写すとノードが縦長になり、ボタンの置き場所が実物と変わるので、向きごとに置く
   */
  const chain = (dir: Dir, ids: string[]): RouteBox[] =>
    ids.map((id, i) => {
      const k = dir === "BT" || dir === "RL" ? ids.length - 1 - i : i;
      return dir === "TD" || dir === "BT"
        ? box(id, 0, 50 + 150 * k, 240, 48)
        : box(id, 50 + 450 * k, 0, 240, 48);
    });
  const SIDES: Record<Dir, [HandleSide, HandleSide]> = {
    TD: ["bottom", "top"],
    BT: ["top", "bottom"],
    LR: ["right", "left"],
    RL: ["left", "right"],
  };
  const handleOf = (b: RouteBox, side: HandleSide): RouteEnd => ({
    side,
    x: side === "left" ? b.x : side === "right" ? b.x + b.width : b.x + b.width / 2,
    y: side === "top" ? b.y : side === "bottom" ? b.y + b.height : b.y + b.height / 2,
  });
  const dirEdge = (dir: Dir, boxes: RouteBox[], s: string, t: string): RouteEdgeInput => ({
    id: `${s}-${t}`,
    source: s,
    target: t,
    from: handleOf(boxes.find((b) => b.id === s)!, SIDES[dir][0]),
    to: handleOf(boxes.find((b) => b.id === t)!, SIDES[dir][1]),
    button: BUTTON,
  });

  for (const dir of ["TD", "BT", "LR", "RL"] as Dir[]) {
    test(`${dir} g: 枠の無い図の戻る線 (spec 17 P0 の g) は、間のノードの外を回る`, () => {
      const boxes = chain(dir, ["S", "A", "B", "C"]);
      const edges = [
        dirEdge(dir, boxes, "S", "A"),
        dirEdge(dir, boxes, "A", "B"),
        dirEdge(dir, boxes, "B", "C"),
        dirEdge(dir, boxes, "C", "A"),
      ];
      const routes = routeEdges(boxes, edges);
      expect(Array.from(routes.keys())).toEqual(["C-A"]);
      expectValidRoute(boxes, edges[3], routes.get("C-A"));
      expectButtonsApart(edges, routes);
    });
  }

  test("LR の閉じた輪 (spec 18 P2): 改善 → 計画 は回り、ボタンはほかのボタンと重ならない", () => {
    // 取り込みの配置 (Web 版の画面で 240×48)。出口は右の辺、入口は左の辺
    const boxes = [
      box("A", 50, 225, 240, 48),
      box("B", 500, 225, 240, 48),
      box("C", 950, 225, 240, 48),
      box("D", 1400, 225, 240, 48),
    ];
    const lr = (s: string, t: string): RouteEdgeInput => {
      const a = boxes.find((b) => b.id === s)!;
      const z = boxes.find((b) => b.id === t)!;
      return {
        id: `${s}-${t}`,
        source: s,
        target: t,
        from: { x: a.x + a.width, y: a.y + a.height / 2, side: "right" },
        to: { x: z.x, y: z.y + z.height / 2, side: "left" },
        button: BUTTON,
      };
    };
    const edges = [lr("A", "B"), lr("B", "C"), lr("C", "D"), lr("D", "A")];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["D-A"]);
    expectValidRoute(boxes, edges[3], routes.get("D-A"));
    expectButtonsApart(edges, routes);
  });

  test("枠の無い閉じた輪の「完了」(spec 18 P2): 在庫確認・請求を貫く線は回り、ボタンが見える", () => {
    const boxes = [
      box("O", 175, 50, 240, 48),
      box("K", 175, 200, 240, 48),
      box("H", 50, 350, 240, 48),
      box("P", 300, 350, 240, 48),
      box("I", 175, 500, 240, 48),
      box("C", 175, 650, 240, 48),
    ];
    const label = (e: RouteEdgeInput, w: number) => ({ ...e, button: { width: w, height: 28 } });
    const edges = [
      tdEdge(boxes, "O", "K"),
      label(tdEdge(boxes, "K", "H"), 148),
      label(tdEdge(boxes, "K", "P"), 148),
      tdEdge(boxes, "P", "K"),
      tdEdge(boxes, "H", "I"),
      tdEdge(boxes, "I", "C"),
      label(tdEdge(boxes, "C", "I"), 124),
      label(tdEdge(boxes, "C", "O"), 112),
    ];
    const routes = routeEdges(boxes, edges);
    expect(routes.has("C-O")).toBe(true);
    expectValidRoute(boxes, edges[7], routes.get("C-O"));
    expectButtonsApart(edges, routes);
  });

  for (const dir of ["TD", "BT", "LR", "RL"] as Dir[]) {
    test(`${dir}: 段を飛ばす線 (A → C) も回り、ボタンは A → B のボタンと重ならない (P0 の 4)`, () => {
      const boxes = chain(dir, ["A", "B", "C"]);
      const edges = [
        dirEdge(dir, boxes, "A", "B"),
        dirEdge(dir, boxes, "B", "C"),
        { ...dirEdge(dir, boxes, "A", "C"), button: { width: 196, height: 28 } },
      ];
      const routes = routeEdges(boxes, edges);
      expect(Array.from(routes.keys())).toEqual(["A-C"]);
      expectValidRoute(boxes, edges[2], routes.get("A-C"));
      expectButtonsApart(edges, routes);
    });
  }

  test("回した線のボタンは、回さない線のボタンをずらした位置 (labelOffset) も避ける", () => {
    const td = [box("A", 0, 50, 240, 48), box("B", 0, 200, 240, 48), box("C", 0, 350, 240, 48)];
    const plain = [tdEdge(td, "A", "B"), tdEdge(td, "B", "C"), tdEdge(td, "A", "C")];
    // まずずらさずに、回した線のボタンの置き場所を見る
    const first = routeEdges(td, plain).get("A-C")!.label;
    // 回さない B → C のボタンを、そこへずらす
    const bc = plain[1];
    const mid = bezierPolyline(bc.from, bc.to)[24];
    const shifted = [
      plain[0],
      { ...bc, labelOffset: { x: first.x - mid.x, y: first.y - mid.y } },
      plain[2],
    ];
    const routes = routeEdges(td, shifted);
    expect(routes.get("A-C")!.label).not.toEqual(first);
    expectButtonsApart(shifted, routes);
  });

  test("曲線がノードの隙間を通り、ボタンだけが縦に丸ごとかかる線は回す (P0 の 2 の反例、裁定 2 の案 C)", () => {
    // 発送と取り寄せが 10px の隙間で並び、在庫確認 → 請求 がその隙間をまっすぐ通る
    const boxes = [
      box("K", 175, 200, 240, 48),
      box("H", 50, 350, 240, 48),
      box("P", 300, 350, 240, 48),
      box("I", 175, 500, 240, 48),
    ];
    const edges = [
      tdEdge(boxes, "K", "H"),
      tdEdge(boxes, "K", "P"),
      tdEdge(boxes, "K", "I"),
      tdEdge(boxes, "H", "I"),
      tdEdge(boxes, "P", "I"),
    ];
    const ki = edges[2];
    // 前提: 曲線はどのノードにも入らない
    for (const b of boxes)
      if (b.id !== "K" && b.id !== "I")
        expect(pathEnters(bezierPolyline(ki.from, ki.to), b), `曲線は ${b.id} に入らない`).toBe(
          false
        );
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["K-I"]);
    expectValidRoute(boxes, ki, routes.get("K-I"));
  });

  /** まっすぐ下る線の横に、ボタンへ横から depth だけかかるノード N を置く */
  const grazing = (depth: number) => {
    const boxes = [box("A", 0, 0, 240, 48), box("B", 0, 300, 240, 48)];
    const e = tdEdge(boxes, "A", "B");
    const btn = curveButton(e);
    return {
      boxes: [...boxes, box("N", btn.x + btn.width - depth, btn.y - 10, 240, 48)],
      edges: [e],
    };
  };
  test("ボタンがノードに 12px 未満かかるだけの線は回さない (かすり, 裁定 2 の案 C)", () => {
    const { boxes, edges } = grazing(ROUTE.MARGIN - 1);
    expect(routeEdges(boxes, edges).size).toBe(0);
  });
  test("ボタンがノードに縦横とも 12px 以上かかる線は回す (裁定 2 の案 C)", () => {
    const { boxes, edges } = grazing(ROUTE.MARGIN);
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["A-B"]);
    expectValidRoute(boxes, edges[0], routes.get("A-B"));
  });

  test("回す対象に当たらない線の形は変わらない (隣り合う段の線は回さない)", () => {
    const boxes = [
      box("A", 175, 50, 240, 48),
      box("B", 50, 200, 240, 48),
      box("C", 300, 200, 240, 48),
      box("D", 175, 350, 240, 48),
    ];
    const edges = [
      tdEdge(boxes, "A", "B"),
      tdEdge(boxes, "A", "C"),
      tdEdge(boxes, "B", "D"),
      tdEdge(boxes, "C", "D"),
    ];
    expect(routeEdges(boxes, edges).size).toBe(0);
  });
});

describe("routeEdges: 回した道筋 (裁定 2)", () => {
  for (const dir of ["TD", "BT", "LR", "RL"] as Dir[]) {
    test(`${dir} a: 戻る線は枠・ノード・端を通らず、接続点の向きから出入りする`, () => {
      const boxes = caseA().map((b) => mapBox(dir, b));
      const edges = edgesA(caseA()).map((e) => mapEdge(dir, e));
      const routes = routeEdges(boxes, edges);
      expect(Array.from(routes.keys())).toEqual(["N-U"]);
      expectValidRoute(boxes, edges.find((e) => e.id === "N-U")!, routes.get("N-U"));
    });

    test(`${dir} c: 段を飛ばす順向きの線 (上のノードから下の枠の中へ) も回す`, () => {
      const base = caseA();
      const edges0 = [...edgesA(base).filter((e) => e.id !== "N-U"), tdEdge(base, "U", "E")];
      const boxes = base.map((b) => mapBox(dir, b));
      const edges = edges0.map((e) => mapEdge(dir, e));
      const routes = routeEdges(boxes, edges);
      expect(Array.from(routes.keys())).toEqual(["U-E"]);
      expectValidRoute(boxes, edges.find((e) => e.id === "U-E")!, routes.get("U-E"));
    });
  }

  test("f: 枠の中の端から出る線は、同じ枠の横のノードと、その枠の見出しを通らない", () => {
    const boxes = caseF();
    const edges = edgesF(boxes);
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys())).toEqual(["f1-T"]);
    expectValidRoute(boxes, edges[5], routes.get("f1-T"));
  });

  test("突き出しを見出しの帯の下まで縮めた先が、浮動小数点の誤差で入口のノードの内側と判定されても、見出しを貫かない (P2 の配布ビルド)", () => {
    // 配布ビルドで利用者が枠を動かした後の位置。接続点は xyflow と同じく縁の 4px 外
    const nx = -382.2151029748284 - 40;
    const ny = 983.5926773455376 - 11.4;
    const boxes = [
      frameBox("R", 156, 350, 288, 274),
      frameBox("S", -641.903890160183, 470.3478260869565, 288, 274),
      frameBox("N", nx, ny, 288, 124),
      box("U", 180, 200, 240, 48),
      box("Z", 180, 50, 240, 48),
      box("A", 180, 402, 240, 48, "R"),
      box("B", 180, 552, 240, 48, "R"),
      box("C", -617.903890160183, 522.3478260869565, 240, 48, "S"),
      box("D", -617.903890160183, 672.3478260869565, 240, 48, "S"),
      box("E", nx + 24, ny + 52, 240, 48, "N"),
    ];
    const byId = new Map(boxes.map((x) => [x.id, x]));
    const e = (source: string, target: string): RouteEdgeInput => {
      const s = byId.get(source)!;
      const t = byId.get(target)!;
      return {
        id: `${source}-${target}`,
        source,
        target,
        from: { x: s.x + s.width / 2, y: s.y + s.height + 4, side: "bottom" },
        to: { x: t.x + t.width / 2, y: t.y - 4, side: "top" },
        button: BUTTON,
      };
    };
    const edges = [
      e("Z", "U"),
      e("A", "B"),
      e("C", "D"),
      e("U", "R"),
      e("R", "S"),
      e("S", "N"),
      e("N", "U"),
      e("U", "E"),
    ];
    const routes = routeEdges(boxes, edges);
    expectValidRoute(boxes, edges[7], routes.get("U-E"));
  });

  test("P2 の図で「通知」の位置を格子でずらしても、回した線はどれも決まりごとを守る (289 通り)", () => {
    const e = (byId: Map<string, RouteBox>, source: string, target: string): RouteEdgeInput => {
      const s = byId.get(source)!;
      const t = byId.get(target)!;
      return {
        id: `${source}-${target}`,
        source,
        target,
        from: { x: s.x + s.width / 2, y: s.y + s.height + 4, side: "bottom" },
        to: { x: t.x + t.width / 2, y: t.y - 4, side: "top" },
        button: BUTTON,
      };
    };
    let routed = 0;
    for (let dx = -40; dx <= 40; dx += 5) {
      for (let dy = -40; dy <= 40; dy += 5) {
        const nx = -382.2151029748284 + dx + 0.37;
        const ny = 983.5926773455376 + dy + 0.41;
        const boxes = [
          frameBox("R", 156, 350, 288, 274),
          frameBox("S", -641.903890160183, 470.3478260869565, 288, 274),
          frameBox("N", nx, ny, 288, 124),
          box("U", 180, 200, 240, 48),
          box("Z", 180, 50, 240, 48),
          box("A", 180, 402, 240, 48, "R"),
          box("B", 180, 552, 240, 48, "R"),
          box("C", -617.903890160183, 522.3478260869565, 240, 48, "S"),
          box("D", -617.903890160183, 672.3478260869565, 240, 48, "S"),
          box("E", nx + 24, ny + 52, 240, 48, "N"),
        ];
        const byId = new Map(boxes.map((x) => [x.id, x]));
        const pairs: [string, string][] = [
          ["Z", "U"],
          ["A", "B"],
          ["C", "D"],
          ["U", "R"],
          ["R", "S"],
          ["S", "N"],
          ["N", "U"],
          ["U", "E"],
        ];
        const edges = pairs.map(([s, t]) => e(byId, s, t));
        const routes = routeEdges(boxes, edges);
        for (const [id, r] of Array.from(routes)) {
          routed++;
          expectValidRoute(boxes, edges.find((x) => x.id === id)!, r);
        }
      }
    }
    expect(routed).toBeGreaterThan(289);
  });

  test("同じ入力なら同じ道筋 (描き直しで変わらない)", () => {
    const boxes = caseA();
    expect(routeEdges(boxes, edgesA(boxes))).toEqual(routeEdges(caseA(), edgesA(caseA())));
  });
});

describe("routeEdges: 回した線どうしの重なりとボタン (D3)", () => {
  test("同じ側を回る 2 本は、長い縦の線分が SPACING 以上離れ、ボタンも重ならない", () => {
    const boxes = caseA();
    const edges = [...edgesA(boxes), tdEdge(boxes, "E", "U")];
    const routes = routeEdges(boxes, edges);
    expect(Array.from(routes.keys()).sort()).toEqual(["E-U", "N-U"]);
    expectValidRoute(boxes, edges.find((e) => e.id === "N-U")!, routes.get("N-U"));
    expectValidRoute(boxes, edges.find((e) => e.id === "E-U")!, routes.get("E-U"));
    const longVerticals = (r: EdgeRoute) =>
      r.points
        .slice(1)
        .flatMap((p, i) =>
          p.x === r.points[i].x && Math.abs(p.y - r.points[i].y) > 300 ? [p.x] : []
        );
    const a = longVerticals(routes.get("N-U")!);
    const b = longVerticals(routes.get("E-U")!);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    for (const x of a)
      for (const y of b) expect(Math.abs(x - y)).toBeGreaterThanOrEqual(ROUTE.SPACING);
    const [l1, l2] = [routes.get("N-U")!.label, routes.get("E-U")!.label];
    const apart = Math.abs(l1.x - l2.x) >= BUTTON.width || Math.abs(l1.y - l2.y) >= BUTTON.height;
    expect(apart, "2 本のボタンは重ならない").toBe(true);
  });
});

describe("routeEdges: 回さない線どうしのボタンの重なり (spec 21)", () => {
  /** ラベルが全角 4 字 + 半角 1 字のボタン (estimateButtonSize の 155×28) */
  const LABEL4 = { width: 155, height: 28 };
  const GAP = 4;

  /** 取り込みと同じ配置の TD の分岐: 元 1 つから同じ段の n 個へ (段の送り 150、同じ段の送り 250) */
  const fanOut = (n: number) => {
    const boxes = [
      box("A", -125 + 300, 50, 240, 48),
      ...Array.from({ length: n }, (_, i) => box(`B${i}`, -(n * 250) / 2 + i * 250 + 300, 200, 240, 48)),
    ];
    const edges = boxes.slice(1).map((b) => ({ ...tdEdge(boxes, "A", b.id), button: LABEL4 }));
    return { boxes, edges };
  };

  const isMoved = (routes: Map<string, EdgeRoute>, id: string) =>
    routes.has(id) && routes.get(id)!.points.length === 0;

  /** 線の部品が置く所: 回した線・ずらした線は返された位置、それ以外は今の位置 (中点 + labelOffset) */
  const shownButton = (e: RouteEdgeInput, routes: Map<string, EdgeRoute>) => {
    const r = routes.get(e.id);
    return r ? buttonRect(r.label, e.button) : curveButton(e);
  };
  const grown = (r: { x: number; y: number; width: number; height: number }, m: number) => ({
    x: r.x - m,
    y: r.y - m,
    width: r.width + 2 * m,
    height: r.height + 2 * m,
  });

  /**
   * 全部のボタンが重ならない。ずらしたボタンは、ほかのボタンと GAP 以上離れ、ノード・枠の見出しと重ならず、
   * 自分の曲線がボタンの縁から 2px 以上内側を通る
   */
  function expectLabelsClear(boxes: RouteBox[], edges: RouteEdgeInput[], routes: Map<string, EdgeRoute>) {
    const shown = edges.map((e) => ({ e, r: shownButton(e, routes) }));
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++)
        expect(
          rectsMeet(shown[i].r, shown[j].r),
          `${shown[i].e.id} と ${shown[j].e.id} のボタンは重ならない`
        ).toBe(false);
    for (const { e, r } of shown) {
      if (!isMoved(routes, e.id)) continue;
      for (const o of shown)
        if (o.e.id !== e.id)
          expect(rectsMeet(grown(r, GAP / 2), grown(o.r, GAP / 2)), `${e.id} は ${o.e.id} と ${GAP}px 離れる`).toBe(false);
      for (const b of boxes) {
        const target = b.frame ? { x: b.x, y: b.y, width: b.width, height: HEADER } : b;
        expect(rectsMeet(r, target), `${e.id} のボタンは ${b.id} に重ならない`).toBe(false);
      }
      const inner = grown(r, -2);
      expect(
        bezierPolyline(e.from, e.to, 400).some(
          (p) => p.x > inner.x && p.x < inner.x + inner.width && p.y > inner.y && p.y < inner.y + inner.height
        ),
        `${e.id} の曲線がずらしたボタンの中を通る`
      ).toBe(true);
    }
  }

  test("TD の分岐 (4 本、全角 4 字): 重なっていたボタンが自分の曲線の上へ退き、全部が離れる。先頭の線は動かない", () => {
    const { boxes, edges } = fanOut(4);
    // 今の位置では隣どうしが重なっている (前提)
    expect(rectsMeet(curveButton(edges[0]), curveButton(edges[1]))).toBe(true);
    const routes = routeEdges(boxes, edges);
    expect(isMoved(routes, "A-B0"), "先頭の線は動かない").toBe(false);
    expect(Array.from(routes.keys()).filter((id) => isMoved(routes, id)).length).toBeGreaterThan(0);
    expectLabelsClear(boxes, edges, routes);
  });

  test("重ならないボタンは動かない (TD の分岐、全角 2 字)", () => {
    const { boxes, edges } = fanOut(4);
    const short = edges.map((e) => ({ ...e, button: { width: 119, height: 28 } }));
    expect(routeEdges(boxes, short).size).toBe(0);
  });

  test("4px 以内に近いだけのボタンは動かさない (きっかけに隙間を入れない, D3-2)", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 200, 240, 48), box("C", 103, 400, 240, 48), box("D", 103, 550, 240, 48)];
    const ab = tdEdge(boxes, "A", "B");
    const cd = tdEdge(boxes, "C", "D");
    // 2 つのボタンを横に 2px 空けて並べる
    const a = curveButton(ab);
    const c = curveButton(cd);
    const edges = [ab, { ...cd, labelOffset: { x: a.x + a.width + 2 - c.x, y: a.y - c.y } }];
    expect(rectsMeet(curveButton(edges[0]), curveButton(edges[1]))).toBe(false);
    expect(routeEdges(boxes, edges).size).toBe(0);
  });

  test("平行な 2 本: 後ろの線のボタンが退く", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 200, 240, 48)];
    const edges = [tdEdge(boxes, "A", "B"), { ...tdEdge(boxes, "A", "B"), id: "A-B-1" }];
    const routes = routeEdges(boxes, edges);
    expect(isMoved(routes, "A-B")).toBe(false);
    expect(isMoved(routes, "A-B-1")).toBe(true);
    expectLabelsClear(boxes, edges, routes);
  });

  test("3 本が重なる: 先頭は動かず、後ろの 2 本が順に退き、互いにも重ならない", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 350, 240, 48)];
    const edges = [0, 1, 2].map((i) => ({ ...tdEdge(boxes, "A", "B"), id: `A-B-${i}` }));
    const routes = routeEdges(boxes, edges);
    expect(isMoved(routes, "A-B-0")).toBe(false);
    expect(isMoved(routes, "A-B-1")).toBe(true);
    expect(isMoved(routes, "A-B-2")).toBe(true);
    expectLabelsClear(boxes, edges, routes);
  });

  test("滑らせた先は、後ろの線のボタン (今の位置) も避ける。後ろの線は何とも重なっていなければ動かない", () => {
    const boxes = [
      box("A", 0, 50, 240, 48),
      box("B", 0, 350, 240, 48),
      box("X", 400, 50, 240, 48),
      box("Y", 400, 350, 240, 48),
    ];
    // A → B の 2 本目は、出口の側 (上) へ 32px 滑らせるのが最初の候補。そこに X → Y のボタンを置いておく
    const xy = tdEdge(boxes, "X", "Y");
    const m = curveButton(xy);
    const edges = [
      tdEdge(boxes, "A", "B"),
      { ...tdEdge(boxes, "A", "B"), id: "A-B-1" },
      { ...xy, labelOffset: { x: 120 - (m.x + m.width / 2), y: 224 - 36 - (m.y + m.height / 2) } },
    ];
    expect(rectsMeet(curveButton(edges[0]), curveButton(edges[2]))).toBe(false);
    const routes = routeEdges(boxes, edges);
    expect(isMoved(routes, "A-B-1")).toBe(true);
    expect(routes.has("X-Y"), "X → Y は今の位置で何とも重ならないので動かない").toBe(false);
    expectLabelsClear(boxes, edges, routes);
  });

  test("線がボタンの中を通る範囲より外へはずらさない (LR の短い平行な 2 本は解けずに今の位置のまま)", () => {
    // 横の線の上では、ボタンを縦にずらせるのは高さの半分 − 2px (12px) まで。2 本目は 32px 離さないと置けない
    const boxes = [box("A", 50, 0, 240, 48), box("B", 500, 0, 240, 48)];
    const lr = (id: string): RouteEdgeInput => ({
      id,
      source: "A",
      target: "B",
      from: { x: 290, y: 24, side: "right" },
      to: { x: 500, y: 24, side: "left" },
      button: BUTTON,
    });
    const routes = routeEdges(boxes, [lr("A-B"), lr("A-B-1")]);
    expect(routes.has("A-B-1")).toBe(false);
  });

  test("自己ループのボタンは動かさず、重なった回さない線の方が退く", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 250, 240, 48), box("S", 400, 50, 240, 48)];
    const loop: RouteEdgeInput = {
      id: "S-S",
      source: "S",
      target: "S",
      from: { x: 520, y: 98, side: "bottom" },
      to: { x: 520, y: 50, side: "top" },
      button: BUTTON,
      // ボタンを S の下の外に置く (S に深くかかる線は spec 19 で回す線になるので、ノードと重ならない所で比べる)
      labelOffset: { x: 0, y: 60 },
    };
    const ab = tdEdge(boxes, "A", "B");
    const l = curveButton(loop);
    const m = curveButton(ab);
    expect(rectsMeet(l, boxes[2])).toBe(false);
    // A → B のボタンを、自己ループのボタンに半分かかる所へずらしておく
    const edges = [loop, { ...ab, labelOffset: { x: l.x + 40 - m.x, y: l.y - m.y } }];
    expect(rectsMeet(curveButton(edges[0]), curveButton(edges[1]))).toBe(true);
    const routes = routeEdges(boxes, edges);
    expect(routes.has("S-S")).toBe(false);
    expect(isMoved(routes, "A-B")).toBe(true);
  });

  test("ノードに少しかかるだけのボタンは動かさない (D3-1)", () => {
    // B の右の外を縦に通る線のボタンが、B の右端に 6px かかる
    const boxes = [box("A", 300, 50, 240, 48), box("C", 300, 350, 240, 48), box("B", 0, 200, 240, 48)];
    const ac = tdEdge(boxes, "A", "C");
    const m = curveButton(ac);
    const edges = [{ ...ac, labelOffset: { x: 240 - 6 - m.x, y: 0 } }];
    expect(rectsMeet(curveButton(edges[0]), boxes[2])).toBe(true);
    expect(routeEdges(boxes, edges).size).toBe(0);
  });

  test("候補が全部端のノードにかかる線は、今の位置のまま (平行 2 本 + 逆向き)", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 200, 240, 48)];
    const ab = tdEdge(boxes, "A", "B");
    const ba: RouteEdgeInput = {
      id: "B-A",
      source: "B",
      target: "A",
      from: { x: 120, y: 248, side: "bottom" },
      to: { x: 120, y: 50, side: "top" },
      button: BUTTON,
    };
    // adjustEdgeLabelPosition のずれ (逆向きの組の ±20。平行な 2 本は同じずれを受ける)
    const edges = [
      { ...ab, labelOffset: { x: 20, y: 20 } },
      { ...ab, id: "A-B-1", labelOffset: { x: 20, y: 20 } },
      { ...ba, labelOffset: { x: -40, y: 40 } },
    ];
    const routes = routeEdges(boxes, edges);
    expect(isMoved(routes, "A-B-1")).toBe(true);
    expect(routes.has("B-A"), "置ける所が無いので今の位置のまま").toBe(false);
  });

  test("回した線のボタンは、ずらした後のボタンを避ける (段を飛ばす線 + 平行な線)", () => {
    const boxes = [box("A", 0, 50, 240, 48), box("B", 0, 200, 240, 48), box("C", 0, 350, 240, 48)];
    const edges = [
      tdEdge(boxes, "A", "B"),
      { ...tdEdge(boxes, "A", "B"), id: "A-B-1" },
      tdEdge(boxes, "B", "C"),
      tdEdge(boxes, "A", "C"),
    ];
    const routes = routeEdges(boxes, edges);
    expect(routes.get("A-C")?.points.length ?? 0, "段を飛ばす線は回る").toBeGreaterThan(0);
    expect(isMoved(routes, "A-B-1")).toBe(true);
    expectLabelsClear(boxes, edges, routes);
  });

  test("同じ入力なら同じ位置 (描き直しで変わらない)", () => {
    const a = fanOut(4);
    const b = fanOut(4);
    expect(routeEdges(a.boxes, a.edges)).toEqual(routeEdges(b.boxes, b.edges));
  });
});
