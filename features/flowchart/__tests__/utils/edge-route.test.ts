/**
 * spec 17: 枠をまたぐ線を、途中の枠・ノードの外へ回す (routeEdges)。
 * 図の座標は P0 の 1 で Web 版の画面から測ったもの (TD の a・f) と、それを向きごとに写したもの
 */
import { describe, expect, test } from "vitest";
import {
  ROUTE,
  routeEdges,
  type EdgeRoute,
  type RouteBox,
  type RouteEdgeInput,
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
  z: parentId ? 1 : 0,
  ...(parentId ? { parentId } : {}),
});
const frameBox = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string
) => ({
  ...box(id, x, y, width, height, parentId, true),
  z: parentId ? 1 : 0,
});

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

  test("枠の無い図の戻る線は、間のノードを貫いても回さない (両端とも図の直下、線はノードの後ろに隠れる)", () => {
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
    expect(routeEdges(boxes, edges).size).toBe(0);
  });

  test("同じ枠の中の戻る線は、同じ高さのノードを貫いても回さない (ノードが線を隠す, P0 の 4)", () => {
    const boxes = [
      frameBox("P", 0, 0, 288, 500),
      box("p1", 24, 52, 240, 48, "P"),
      box("p2", 24, 202, 240, 48, "P"),
      box("p3", 24, 352, 240, 48, "P"),
    ];
    const edges = [tdEdge(boxes, "p1", "p2"), tdEdge(boxes, "p2", "p3"), tdEdge(boxes, "p3", "p1")];
    expect(routeEdges(boxes, edges).size).toBe(0);
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
