/**
 * spec 22 D1 (案 B): search の入れ物と格子の作り方だけを変え、出す道は前と同じにする (受け入れ条件 2)。
 * - 乱数で作った格子の入力で、速くする前の search の写し (search-reference.ts) と同じ道を返す
 * - 大きな図 2 つ (spec 17・19 P2 の図。fixtures/large-*) の routeEdges の出力が golden と同じ。
 *   全部の計算と、ノード・枠を 30 歩動かすドラッグ中の毎歩 (今の使い回しの判定 reusableEdges) と、手を離した時の全部の計算。
 *   golden は出力の JSON の sha256 の頭 16 字 (fixtures/large-routes.golden.json)
 * 線の道の選び方・ボタンの置き方を意図して変えてこのテストが落ちたら、変わり方を確かめてから LORELEI_UPDATE_FIXTURES=1 で golden を書き直す
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import { adjustEdgeLabelPosition } from "@/features/flowchart/hooks/edge-layout";
import { estimateButtonSize, reusableEdges } from "@/features/flowchart/hooks/use-edge-routes";
import {
  routeEdges,
  search,
  type EdgeRoute,
  type RouteBox,
  type RouteEdgeInput,
} from "@/features/flowchart/utils/edge-route";
import type { Point } from "@/features/flowchart/utils/frame-edit";
import { flowFromMermaid } from "@/features/flowchart/utils/from-mermaid";
import { searchReference } from "./search-reference";

const FIXTURES = path.resolve(__dirname, "fixtures");
const GOLDEN = path.join(FIXTURES, "large-routes.golden.json");

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 決まった乱数 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const strictlyInside = (p: Point, r: Rect) =>
  p.x > r.x + 1e-6 && p.x < r.x + r.width - 1e-6 && p.y > r.y + 1e-6 && p.y < r.y + r.height - 1e-6;

/**
 * 格子の入力: 矩形 0〜99 個 (重なる・縁が揃う・24 刻みの座標と小数の座標)。
 * 2 点は矩形の内側でない所で、半分は矩形の縁の上 (突き出しの先が避けるものの縁に乗る形)。
 * 揃えた縁と縁の上の点の半分は、誤差の幅 (EDGE_EPS = 1e-6) より小さくずらす (別々に求めた「同じ縁」が食い違う形, failures #31)
 */
function gridCase(rand: () => number) {
  const coord = () => (rand() < 0.5 ? Math.round(rand() * 100) * 24 : rand() * 2400) - 200;
  const jitter = () => (rand() < 0.5 ? 0 : (rand() - 0.5) * 1e-6);
  const rects: Rect[] = [];
  const n = Math.floor(rand() * 100);
  for (let k = 0; k < n; k++) {
    const r = { x: coord(), y: coord(), width: 24 + rand() * 300, height: 24 + rand() * 120 };
    if (rects.length > 0 && rand() < 0.2) {
      // 前の矩形と縁を揃える
      const o = rects[Math.floor(rand() * rects.length)];
      if (rand() < 0.5) r.x = o.x + o.width + jitter();
      else r.y = o.y + o.height + jitter();
    }
    rects.push(r);
  }
  const point = (): Point => {
    for (let tries = 0; tries < 200; tries++) {
      let p: Point;
      if (rects.length > 0 && rand() < 0.5) {
        const r = rects[Math.floor(rand() * rects.length)];
        p =
          rand() < 0.5
            ? { x: (rand() < 0.5 ? r.x : r.x + r.width) + jitter(), y: r.y + rand() * r.height }
            : { x: r.x + rand() * r.width, y: (rand() < 0.5 ? r.y : r.y + r.height) + jitter() };
      } else {
        p = { x: coord(), y: coord() };
      }
      if (!rects.some((r) => strictlyInside(p, r))) return p;
    }
    return { x: -5000, y: -5000 };
  };
  return {
    a: point(),
    aDir: Math.floor(rand() * 4),
    b: point(),
    bDir: Math.floor(rand() * 4),
    avoid: rects,
  };
}

describe("search は速くする前と同じ道を返す (spec 22 D1)", () => {
  test("乱数の格子の入力 1000 通り", () => {
    const rand = rng(22);
    let bent = 0;
    const mismatches: string[] = [];
    for (let k = 0; k < 1000; k++) {
      const c = gridCase(rand);
      const want = searchReference(c.a, c.aDir, c.b, c.bDir, c.avoid);
      const got = search(c.a, c.aDir, c.b, c.bDir, c.avoid);
      if ((want?.length ?? 0) >= 3) bent++;
      if (JSON.stringify(got) !== JSON.stringify(want) && mismatches.length < 3)
        mismatches.push(`#${k}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    }
    expect(mismatches).toEqual([]);
    // 曲がりのある道を十分に通している (2 点は矩形の外で、格子の外周は通れるので、道は必ず見つかる)
    expect(bent).toBeGreaterThan(500);
  });
});

const boxKey = (b: RouteBox) =>
  `${b.x},${b.y},${b.width},${b.height},${b.parentId ?? ""},${b.frame}`;
const edgeKey = (e: RouteEdgeInput) =>
  `${e.source}>${e.target}|${e.from.x},${e.from.y},${e.from.side}|${e.to.x},${e.to.y},${e.to.side}|${e.button.width}|${e.labelOffset?.x ?? 0},${e.labelOffset?.y ?? 0}`;

/** 大きな図: 本物の mermaid.js で取り込み、保存された位置に置く。ノードは 240×48、接続点は出口が下の辺の中央・入口が上の辺の中央 (TD) */
async function loadLarge(name: "frameless" | "framed") {
  const snapshot = await readMermaidDiagram(
    readFileSync(path.join(FIXTURES, `large-${name}.mmd`), "utf8")
  );
  if (snapshot.kind !== "flowchart") throw new Error(name);
  const data = flowFromMermaid(snapshot).data;
  const layout = JSON.parse(
    readFileSync(path.join(FIXTURES, `large-${name}.layout.json`), "utf8")
  ) as Record<string, { x: number; y: number; width?: number; height?: number }>;
  const parentOf = new Map<string, string>();
  (data.subgraphs ?? []).forEach((f) => {
    if (f.parent) parentOf.set(f.id, f.parent);
    f.nodes.forEach((n) => parentOf.set(n, f.id));
  });
  const frames = new Set((data.subgraphs ?? []).map((f) => f.id));
  const boxes: RouteBox[] = [...Array.from(frames), ...data.nodes.map((n) => n.id)].map((id) => {
    const p = layout[id];
    return {
      id,
      x: p.x,
      y: p.y,
      width: p.width ?? 240,
      height: p.height ?? 48,
      frame: frames.has(id),
      ...(parentOf.has(id) ? { parentId: parentOf.get(id) } : {}),
    };
  });
  const xyEdges = data.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  const edgesOf = (bs: RouteBox[]): RouteEdgeInput[] => {
    const by = new Map(bs.map((b) => [b.id, b]));
    return data.edges.flatMap((e) => {
      const s = by.get(e.source);
      const t = by.get(e.target);
      if (!s || !t) return [];
      const { adjustedX, adjustedY } = adjustEdgeLabelPosition(e, 0, 0, xyEdges as never, []);
      return [
        {
          id: e.id,
          source: e.source,
          target: e.target,
          from: { x: s.x + s.width / 2, y: s.y + s.height, side: "bottom" as const },
          to: { x: t.x + t.width / 2, y: t.y, side: "top" as const },
          button: estimateButtonSize(e.label ?? ""),
          labelOffset: { x: adjustedX, y: adjustedY },
        },
      ];
    });
  };
  /** 枠を動かすと中のものも動く (矩形は絶対座標) */
  const group = (id: string): Set<string> => {
    const out = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const b of boxes)
        if (b.parentId !== undefined && out.has(b.parentId) && !out.has(b.id)) {
          out.add(b.id);
          grew = true;
        }
    }
    return out;
  };
  return { boxes, edgesOf, group };
}

const digest = (out: Map<string, EdgeRoute>) =>
  createHash("sha256")
    .update(JSON.stringify(Array.from(out)))
    .digest("hex")
    .slice(0, 16);

/** ドラッグ: use-edge-routes の run と同じ手順 (前の回の矩形と線の入力を覚え、reusableEdges で使い回す)。最後に手を離した時の全部の計算 */
function dragDigests(
  boxes: RouteBox[],
  edgesOf: (bs: RouteBox[]) => RouteEdgeInput[],
  moving: Set<string>,
  step: Point
): string[] {
  const cache = new Map<string, Point[] | null>();
  let prevBoxes = new Map<string, string>();
  let prevRects = new Map<string, Rect>();
  let prevEdges = new Map<string, string>();
  const run = (bs: RouteBox[], dragging: boolean) => {
    const edges = edgesOf(bs);
    const reuse = dragging
      ? reusableEdges(prevBoxes, bs, prevEdges, edges, cache, prevRects)
      : new Set<string>();
    const out = routeEdges(bs, edges, { cache, reuse });
    prevBoxes = new Map(bs.map((b) => [b.id, boxKey(b)]));
    prevRects = new Map(
      bs.map((b) => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }])
    );
    prevEdges = new Map(edges.map((e) => [e.id, edgeKey(e)]));
    return digest(out);
  };
  const out = [run(boxes, false)];
  let cur = boxes;
  for (let i = 0; i < 30; i++) {
    cur = cur.map((b) => (moving.has(b.id) ? { ...b, x: b.x + step.x, y: b.y + step.y } : b));
    out.push(run(cur, true));
  }
  out.push(run(cur, false));
  return out;
}

describe("大きな図の routeEdges の出力が前と同じ (spec 22 受け入れ条件 2)", () => {
  test("全部の計算・ドラッグ中の毎歩・手を離した時", async () => {
    const got: Record<string, string | string[]> = {};
    const scenes: ["frameless" | "framed", string, Point][] = [
      ["frameless", "n57", { x: 10, y: 0 }],
      ["frameless", "n68", { x: 0, y: 10 }],
      ["framed", "n38", { x: 10, y: 0 }],
      ["framed", "F10", { x: 10, y: 0 }],
    ];
    for (const name of ["frameless", "framed"] as const) {
      const { boxes, edgesOf, group } = await loadLarge(name);
      got[`${name}:full`] = digest(routeEdges(boxes, edgesOf(boxes)));
      for (const [n, id, step] of scenes) {
        if (n !== name) continue;
        got[`${name}:${id}:${step.x > 0 ? "h" : "v"}`] = dragDigests(
          boxes,
          edgesOf,
          group(id),
          step
        );
      }
    }
    if (process.env.LORELEI_UPDATE_FIXTURES) {
      writeFileSync(GOLDEN, `${JSON.stringify(got, null, 2)}\n`);
    }
    expect(got).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
  }, 180_000);
});
