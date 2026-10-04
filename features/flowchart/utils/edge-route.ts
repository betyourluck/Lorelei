/**
 * 枠をまたぐ線・ノードを貫く線を、途中の枠・ノードの外へ回す (spec 17、spec 19)。
 * 今の曲線 (xyflow の getBezierPath) が枠 (端である枠の内側を含む) かノードを貫く線、またはボタンがノードに深くかかる線だけを回し
 * (spec 19 裁定 1・2。spec 17 の裁定 1 はノードを線より低いものに限っていた)、
 * 縦と横の線分だけの道を、道のり + 曲がりの重みが最小になるように探す (spec 17 裁定 2)。回した線どうしの重なりとボタンの位置は spec 17 D3・spec 19 D3
 */
import type { HandleSide, Point } from "./frame-edit";

/** 定数 (spec 17 D3。初めの値は P0 の 5・6 の測りから) */
export const ROUTE = {
  /** 接続点から真っすぐ出る長さ (枠の自己ループと同じ) */
  STUB: 20,
  /** 障害物から離す幅 */
  MARGIN: 12,
  /** 曲がり 1 回の重み */
  BEND_COST: 40,
  /** 角の丸め */
  CORNER: 8,
  /** 回した線どうしが重なる時に離す幅 */
  SPACING: 8,
  /** ボタンをずらす刻み */
  BUTTON_GAP: 8,
} as const;

/** 枠の見出しの帯の高さ (frame-edit の FRAME_TITLE_HEIGHT と同じ) */
const HEADER = 28;
/** 回すかの判定で曲線を刻む数 */
const SAMPLES = 48;

/** ノード・枠の絶対の矩形 */
export interface RouteBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  frame: boolean;
}

export interface RouteEnd extends Point {
  side: HandleSide;
}

export interface RouteEdgeInput {
  id: string;
  source: string;
  target: string;
  from: RouteEnd;
  to: RouteEnd;
  /** ラベルのボタンの大きさ */
  button: { width: number; height: number };
  /**
   * 回さない時のボタンの、曲線の中点からのずれ (線の部品が adjustEdgeLabelPosition でずらす分)。
   * 回さない線のボタンの位置を、線の部品が描く位置と揃えるのに使う (spec 19 D3)
   */
  labelOffset?: Point;
}

export interface EdgeRoute {
  /** 出口の接続点から入口の接続点までの折れ線 (縦と横の線分だけ) */
  points: Point[];
  /** ラベルのボタンの中心 */
  label: Point;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const grow = (r: Rect, m: number): Rect => ({
  x: r.x - m,
  y: r.y - m,
  width: r.width + 2 * m,
  height: r.height + 2 * m,
});
const strictlyInside = (p: Point, r: Rect) =>
  p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
/** 縁から eps より内側か (縁どうしが誤差の幅で重なる所を内側と見ない) */
const insideBeyond = (p: Point, r: Rect, eps: number) =>
  p.x > r.x + eps && p.x < r.x + r.width - eps && p.y > r.y + eps && p.y < r.y + r.height - eps;
/** 座標の誤差の幅 */
const EDGE_EPS = 1e-6;
const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const headerOf = (f: Rect): Rect => ({ x: f.x, y: f.y, width: f.width, height: HEADER });

/** 線分が矩形の内側 (縁は含まない) を通るか (Liang–Barsky) */
function segmentHits(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] <= 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-9;
}
const pathHits = (pts: Point[], r: Rect) =>
  pts.some((p, i) => i > 0 && segmentHits(pts[i - 1], p, r));

/** xyflow の getBezierPath と同じ制御点 (curvature 0.25) */
function controlPoint(end: RouteEnd, other: Point): Point {
  const offset = (d: number) => (d >= 0 ? 0.5 * d : 0.25 * 25 * Math.sqrt(-d));
  switch (end.side) {
    case "left":
      return { x: end.x - offset(end.x - other.x), y: end.y };
    case "right":
      return { x: end.x + offset(other.x - end.x), y: end.y };
    case "top":
      return { x: end.x, y: end.y - offset(end.y - other.y) };
    default:
      return { x: end.x, y: end.y + offset(other.y - end.y) };
  }
}

/** 今の曲線を折れ線に刻む */
export function bezierPolyline(from: RouteEnd, to: RouteEnd, samples = SAMPLES): Point[] {
  const c1 = controlPoint(from, to);
  const c2 = controlPoint(to, from);
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    pts.push({
      x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
      y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
    });
  }
  return pts;
}

const SIDE_VECTOR: Record<HandleSide, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 線ごとの見方: 通れる枠・障害物・避けるもの */
interface EdgeView {
  /** どちらの端も中にいない枠・ノード */
  obstacles: RouteBox[];
  /** 端そのもの */
  ends: RouteBox[];
  /** 端の祖先の枠 */
  passable: RouteBox[];
}

function viewOf(byId: Map<string, RouteBox>, boxes: RouteBox[], e: RouteEdgeInput): EdgeView {
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    for (let p = byId.get(id)?.parentId; p !== undefined && !out.has(p); p = byId.get(p)?.parentId)
      out.add(p);
    return out;
  };
  const pass = new Set(Array.from(ancestors(e.source)).concat(Array.from(ancestors(e.target))));
  const ends = [byId.get(e.source), byId.get(e.target)].filter((b): b is RouteBox => !!b);
  return {
    obstacles: boxes.filter((b) => b.id !== e.source && b.id !== e.target && !pass.has(b.id)),
    ends,
    passable: boxes.filter((b) => pass.has(b.id)),
  };
}

/** 回さない時のボタンの中心: 曲線の中点 (getBezierPath のラベルの位置、t = 0.5) に labelOffset を足した所 */
function curveLabel(e: RouteEdgeInput): Point {
  const c1 = controlPoint(e.from, e.to);
  const c2 = controlPoint(e.to, e.from);
  return {
    x: (e.from.x + 3 * c1.x + 3 * c2.x + e.to.x) / 8 + (e.labelOffset?.x ?? 0),
    y: (e.from.y + 3 * c1.y + 3 * c2.y + e.to.y) / 8 + (e.labelOffset?.y ?? 0),
  };
}
const rectAround = (c: Point, size: { width: number; height: number }): Rect => ({
  x: c.x - size.width / 2,
  y: c.y - size.height / 2,
  width: size.width,
  height: size.height,
});
/** かかる深さ: 重なりの横の幅と縦の幅の小さい方 (重ならなければ 0 以下) */
const overlapDepth = (a: Rect, b: Rect) =>
  Math.min(
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  );

/**
 * 回すか (spec 19 裁定 1 の案 A・裁定 2 の案 C):
 * - 今の曲線か、回さない時のボタンが、枠 (どちらの端も中にいない枠・端である枠の内側) と交わる (ボタンだけが枠にかかる線も回す。spec 17 P1 の画面の LR の e)
 * - 今の曲線が、ノード (高さを問わない) を貫く
 * - ボタンが、ノードに縦横とも ROUTE.MARGIN 以上かかる (かすりでは回さない。隙間を通る線のボタンが丸ごと隠れる形は拾う)
 */
function needsRoute(e: RouteEdgeInput, v: EdgeView): boolean {
  const curve = bezierPolyline(e.from, e.to);
  const button = rectAround(curveLabel(e), e.button);
  // 曲線とボタンを囲む矩形に重なるものだけを見る
  const xs = curve.map((p) => p.x).concat([button.x, button.x + button.width]);
  const ys = curve.map((p) => p.y).concat([button.y, button.y + button.height]);
  const reach: Rect = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const frames = [...v.obstacles, ...v.ends].filter((b) => b.frame && rectsOverlap(b, reach));
  const nodes = v.obstacles.filter((b) => !b.frame && rectsOverlap(b, reach));
  return (
    frames.some((r) => pathHits(curve, r) || rectsOverlap(button, r)) ||
    nodes.some((r) => pathHits(curve, r) || overlapDepth(button, r) >= ROUTE.MARGIN)
  );
}

/** 突き出しをこれより短くはしない */
const MIN_STUB = 4;

/**
 * 突き出し: 接続点の向きへ STUB 出す。先が避けるものの中なら、まずその手前まで縮め (MIN_STUB 以上残る時。
 * 枠の中のノードの上の接続点と、その枠の見出しの帯の間のような狭い所)、残らなければ外に出るまで伸ばす。出られなければ null
 */
function stubEnd(end: RouteEnd, avoid: Rect[]): Point | null {
  const v = SIDE_VECTOR[end.side];
  const first = { x: end.x + v.x * ROUTE.STUB, y: end.y + v.y * ROUTE.STUB };
  const blocker = avoid.find((r) => insideBeyond(first, r, EDGE_EPS));
  if (blocker) {
    const near =
      v.x > 0
        ? blocker.x - end.x
        : v.x < 0
          ? end.x - (blocker.x + blocker.width)
          : v.y > 0
            ? blocker.y - end.y
            : end.y - (blocker.y + blocker.height);
    // 先は避けるものの縁そのものに置く (end + near で求めると誤差が乗る)。縁が別の避けるもの (入口のノードの広げた矩形など) の縁と
    // 重なる時、誤差だけで「内側」と判定して縮める道を捨て、見出しを貫く方へ伸ばしていた (P2 の配布ビルド)
    const q =
      v.x !== 0
        ? { x: v.x > 0 ? blocker.x : blocker.x + blocker.width, y: end.y }
        : { x: end.x, y: v.y > 0 ? blocker.y : blocker.y + blocker.height };
    if (near >= MIN_STUB && !avoid.some((r) => insideBeyond(q, r, EDGE_EPS))) return q;
  }
  let len: number = ROUTE.STUB;
  for (let k = 0; k < 20; k++) {
    const q = { x: end.x + v.x * len, y: end.y + v.y * len };
    const hit = avoid.find((r) => insideBeyond(q, r, EDGE_EPS));
    if (!hit) return q;
    len =
      v.x > 0
        ? hit.x + hit.width - end.x + 1
        : v.x < 0
          ? end.x - hit.x + 1
          : v.y > 0
            ? hit.y + hit.height - end.y + 1
            : end.y - hit.y + 1;
  }
  return null;
}

/** 最小の重みの取り出し */
class MinHeap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(item: [number, number]) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** 向き: 0 右・1 左・2 下・3 上 */
const DIR_OF: Record<HandleSide, number> = { right: 0, left: 1, bottom: 2, top: 3 };
const OPPOSITE = [1, 0, 3, 2];
/** 同じ重みなら右・下を先に取るための、ごく小さな重み (道のりの選び方は変えない) */
const TIE = [0, 1e-6, 0, 1e-6];

/**
 * 直交の見通しの格子 (避けるものを MARGIN 広げた矩形の辺の座標と、突き出しの先の座標) の上で、
 * 道のり + BEND_COST × 曲がりの数が最小の道を探す (A*)。状態は「点 × 来た向き」で、来た向きと逆へは進まない
 */
function search(a: Point, aDir: number, b: Point, bDir: number, avoid: Rect[]): Point[] | null {
  const pad = 2 * ROUTE.MARGIN;
  const uniq = (xs: number[]) => Array.from(new Set(xs)).sort((p, q) => p - q);
  const xs = uniq([
    a.x,
    b.x,
    ...avoid.flatMap((r) => [r.x, r.x + r.width]),
    Math.min(a.x, b.x, ...avoid.map((r) => r.x)) - pad,
    Math.max(a.x, b.x, ...avoid.map((r) => r.x + r.width)) + pad,
  ]);
  const ys = uniq([
    a.y,
    b.y,
    ...avoid.flatMap((r) => [r.y, r.y + r.height]),
    Math.min(a.y, b.y, ...avoid.map((r) => r.y)) - pad,
    Math.max(a.y, b.y, ...avoid.map((r) => r.y + r.height)) + pad,
  ]);
  const X = xs.length;
  const Y = ys.length;
  // 内側の判定は縁から EDGE_EPS より内側だけ (別々に求めた縁が誤差の幅で食い違うと、縁に沿う通り道が塞がる。P2 の配布ビルド)
  const free = new Uint8Array(X * Y);
  const rightOk = new Uint8Array(X * Y);
  const downOk = new Uint8Array(X * Y);
  for (let j = 0; j < Y; j++) {
    const y = ys[j];
    const row = avoid.filter((r) => y > r.y + EDGE_EPS && y < r.y + r.height - EDGE_EPS);
    for (let i = 0; i < X; i++) {
      const x = xs[i];
      free[j * X + i] = row.some((r) => x > r.x + EDGE_EPS && x < r.x + r.width - EDGE_EPS) ? 0 : 1;
      if (i + 1 < X) {
        const mx = (x + xs[i + 1]) / 2;
        rightOk[j * X + i] = row.some((r) => mx > r.x && mx < r.x + r.width) ? 0 : 1;
      }
    }
  }
  for (let i = 0; i < X; i++) {
    const x = xs[i];
    const col = avoid.filter((r) => x > r.x + EDGE_EPS && x < r.x + r.width - EDGE_EPS);
    for (let j = 0; j + 1 < Y; j++) {
      const my = (ys[j] + ys[j + 1]) / 2;
      downOk[j * X + i] = col.some((r) => my > r.y && my < r.y + r.height) ? 0 : 1;
    }
  }
  const si = xs.indexOf(a.x);
  const sj = ys.indexOf(a.y);
  const ti = xs.indexOf(b.x);
  const tj = ys.indexOf(b.y);
  const states = X * Y * 4;
  const dist = new Float64Array(states).fill(Infinity);
  const prev = new Int32Array(states).fill(-1);
  const h = (i: number, j: number) => Math.abs(xs[i] - xs[ti]) + Math.abs(ys[j] - ys[tj]);
  const start = (sj * X + si) * 4 + aDir;
  dist[start] = 0;
  const heap = new MinHeap();
  heap.push([h(si, sj), start]);
  let goal = -1;
  while (heap.size) {
    const [, st] = heap.pop();
    const p = Math.floor(st / 4);
    const d = st % 4;
    const i = p % X;
    const j = Math.floor(p / X);
    if (i === ti && j === tj && d === bDir) {
      goal = st;
      break;
    }
    const base = dist[st];
    const moves: [number, number, number][] = [];
    if (i + 1 < X && rightOk[j * X + i]) moves.push([i + 1, j, 0]);
    if (i > 0 && rightOk[j * X + i - 1]) moves.push([i - 1, j, 1]);
    if (j + 1 < Y && downOk[j * X + i]) moves.push([i, j + 1, 2]);
    if (j > 0 && downOk[(j - 1) * X + i]) moves.push([i, j - 1, 3]);
    for (const [ni, nj, nd] of moves) {
      if (nd === OPPOSITE[d]) continue;
      const q = nj * X + ni;
      const atGoal = ni === ti && nj === tj;
      if (!free[q] && !atGoal) continue;
      const len = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      const cost = base + len * (1 + TIE[nd]) + (nd !== d ? ROUTE.BEND_COST : 0);
      const ns = q * 4 + nd;
      if (cost < dist[ns]) {
        dist[ns] = cost;
        prev[ns] = st;
        heap.push([cost + h(ni, nj), ns]);
      }
    }
    // 入口の突き出しの先で、入る向きへ曲がる
    if (i === ti && j === tj && d !== bDir && d !== OPPOSITE[bDir]) {
      const ns = p * 4 + bDir;
      const cost = base + ROUTE.BEND_COST;
      if (cost < dist[ns]) {
        dist[ns] = cost;
        prev[ns] = st;
        heap.push([cost, ns]);
      }
    }
  }
  if (goal < 0) return null;
  const pts: Point[] = [];
  for (let st = goal; st >= 0; st = prev[st]) {
    const p = Math.floor(st / 4);
    const pt = { x: xs[p % X], y: ys[Math.floor(p / X)] };
    const last = pts[pts.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) pts.push(pt);
  }
  return pts.reverse();
}

/**
 * 探索に使う避けるものを、2 点の周りに絞る: 2 点を囲む矩形に交わるものを入れ、入れたものを囲むまで矩形を広げる、を繰り返す。
 * 探索の格子の外周は、入れたものと 2 点を囲む矩形の外へ 2 MARGIN なので、その外周の内側に交わるものは全部入っている
 * (図全体の障害物で格子を作ると、ノード 110・線 150 の図で 1 回の計算が 150ms を超えた。P1 の画面)
 */
function nearby(a: Point, b: Point, avoid: Rect[]): Rect[] {
  const pad = 2 * ROUTE.MARGIN;
  let win: Rect = grow(
    {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    },
    pad
  );
  let picked: Rect[] = [];
  for (;;) {
    const next = avoid.filter((r) => rectsOverlap(r, win));
    if (next.length === picked.length) return next;
    picked = next;
    const x1 = Math.min(win.x, ...picked.map((r) => r.x - pad));
    const y1 = Math.min(win.y, ...picked.map((r) => r.y - pad));
    const x2 = Math.max(win.x + win.width, ...picked.map((r) => r.x + r.width + pad));
    const y2 = Math.max(win.y + win.height, ...picked.map((r) => r.y + r.height + pad));
    win = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
}

/** 同じ向きに続く点を除く */
function simplify(pts: Point[]): Point[] {
  return pts.filter((q, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const p = pts[i - 1];
    const r = pts[i + 1];
    return !((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y));
  });
}

/**
 * 突き出しの先が、通れる枠の縁の内側 MARGIN 以内にある時は、その縁を越えて外へ MARGIN 出るまで伸ばす
 * (伸ばさないと、枠の縁のすぐ内側を縁に沿って走る線ができる。P1 の画面の f: 枠の中のノードの下の辺から枠の下の縁まで 24)
 */
function clearOfBorders(end: RouteEnd, q: Point, frames: RouteBox[], avoid: Rect[]): Point {
  const v = SIDE_VECTOR[end.side];
  let out = q;
  for (const f of frames) {
    if (!strictlyInside(out, f)) continue;
    const toBorder =
      v.x > 0
        ? f.x + f.width - out.x
        : v.x < 0
          ? out.x - f.x
          : v.y > 0
            ? f.y + f.height - out.y
            : out.y - f.y;
    if (toBorder >= ROUTE.MARGIN) continue;
    const next = {
      x: out.x + v.x * (toBorder + ROUTE.MARGIN),
      y: out.y + v.y * (toBorder + ROUTE.MARGIN),
    };
    if (avoid.some((r) => insideBeyond(next, r, EDGE_EPS))) return out;
    out = next;
  }
  return out;
}

/** 1 本の線の道筋 (端から端まで)。見つからなければ null */
function routeOne(e: RouteEdgeInput, v: EdgeView): Point[] | null {
  const avoid = [...v.obstacles, ...v.ends, ...v.passable.filter((f) => f.frame).map(headerOf)].map(
    (r) => grow(r, ROUTE.MARGIN)
  );
  // 内側の枠から順に縁を越える (入れ子の枠の縁が近い時)
  const frames = v.passable
    .filter((f) => f.frame)
    .sort((p, q) => p.width * p.height - q.width * q.height);
  const a0 = stubEnd(e.from, avoid);
  const b0 = stubEnd(e.to, avoid);
  const a = a0 && clearOfBorders(e.from, a0, frames, avoid);
  const b = b0 && clearOfBorders(e.to, b0, frames, avoid);
  if (!a || !b) return null;
  // 入口へは、接続点の向きの反対へ進んで入る
  const inDir = OPPOSITE[DIR_OF[e.to.side]];
  const path = search(a, DIR_OF[e.from.side], b, inDir, nearby(a, b, avoid));
  if (!path) return null;
  return simplify([{ x: e.from.x, y: e.from.y }, ...path, { x: e.to.x, y: e.to.y }]);
}

/** 線分 */
interface Segment {
  edge: string;
  /** points の何番目から */
  index: number;
  vertical: boolean;
  /** 縦なら x、横なら y */
  at: number;
  from: number;
  to: number;
}

function segmentsOf(edge: string, pts: Point[]): Segment[] {
  return pts.slice(1).map((p, i) => {
    const q = pts[i];
    const vertical = p.x === q.x;
    return {
      edge,
      index: i,
      vertical,
      at: vertical ? p.x : p.y,
      from: vertical ? Math.min(p.y, q.y) : Math.min(p.x, q.x),
      to: vertical ? Math.max(p.y, q.y) : Math.max(p.x, q.x),
    };
  });
}
const collinearOverlap = (s: Segment, t: Segment) =>
  s.vertical === t.vertical &&
  Math.abs(s.at - t.at) < 0.5 &&
  Math.min(s.to, t.to) - Math.max(s.from, t.from) > 1;

/** 線分が枠の縁に MARGIN 未満の間を空けて、MARGIN より長く沿うか */
function hugsBorder(seg: Segment, f: Rect): boolean {
  const borders = seg.vertical ? [f.x, f.x + f.width] : [f.y, f.y + f.height];
  const [lo, hi] = seg.vertical ? [f.y, f.y + f.height] : [f.x, f.x + f.width];
  const along = Math.min(seg.to, hi) - Math.max(seg.from, lo);
  return (
    along > ROUTE.MARGIN && borders.some((b) => Math.abs(seg.at - b) < ROUTE.MARGIN - EDGE_EPS)
  );
}

/**
 * 回した線どうしが同じ線分の上に重なる時だけ、後の線 (線の ID の順) の線分を SPACING ずつ離す (D3)。
 * 接続点に付いた線分 (最初と最後) は動かさない。離した線分と両隣が障害物を通る時は、その幅は使わない
 */
function separate(
  routes: Map<string, Point[]>,
  avoidOf: Map<string, Rect[]>,
  framesOf: Map<string, Rect[]>
): void {
  const placed: Segment[] = [];
  for (const id of Array.from(routes.keys()).sort()) {
    const pts = routes.get(id)!;
    const avoid = avoidOf.get(id)!;
    const frames = framesOf.get(id) ?? [];
    for (let i = 1; i + 2 < pts.length; i++) {
      const seg = segmentsOf(id, pts)[i];
      if (!placed.some((t) => collinearOverlap(seg, t))) continue;
      // 離した線分と両隣が届きうる範囲のものだけを見る
      const span = 6 * ROUTE.SPACING;
      const xs = pts.slice(i - 1, i + 3).map((p) => p.x);
      const ys = pts.slice(i - 1, i + 3).map((p) => p.y);
      const reach: Rect = {
        x: Math.min(...xs) - span,
        y: Math.min(...ys) - span,
        width: Math.max(...xs) - Math.min(...xs) + 2 * span,
        height: Math.max(...ys) - Math.min(...ys) + 2 * span,
      };
      const near = avoid.filter((r) => rectsOverlap(r, reach));
      for (let k = 1; k <= 6; k++) {
        const tried = [-k, k]
          .map((s) => s * ROUTE.SPACING)
          .find((off) => {
            const next = pts.map((p) => ({ ...p }));
            if (seg.vertical) {
              next[i].x += off;
              next[i + 1].x += off;
            } else {
              next[i].y += off;
              next[i + 1].y += off;
            }
            const around = next.slice(i - 1, i + 3);
            if (near.some((r) => pathHits(around, r))) return false;
            // 離した線分そのものは、避けるものから MARGIN の半分は空け、通れる枠の縁に MARGIN 未満で沿わない
            // (枠の側へずらして、枠の縁の 4px 外を縁に沿って走った。P2 の配布ビルド)
            const lane = next.slice(i, i + 2);
            if (near.some((r) => pathHits(lane, grow(r, ROUTE.MARGIN / 2)))) return false;
            const moved = segmentsOf(id, next)[i];
            if (frames.some((f) => hugsBorder(moved, f))) return false;
            return !placed.some((t) => collinearOverlap(moved, t));
          });
        if (tried !== undefined) {
          if (seg.vertical) {
            pts[i].x += tried;
            pts[i + 1].x += tried;
          } else {
            pts[i].y += tried;
            pts[i + 1].y += tried;
          }
          break;
        }
      }
    }
    placed.push(...segmentsOf(id, pts));
  }
}

/** ボタンを線分と直交する向きにずらす刻みと、線をボタンの縁からこれだけ内側に残す幅 (spec 19 P1) */
const BUTTON_SHIFT_STEP = 2;
const BUTTON_LINE_INSET = 2;

/**
 * ボタンの位置 (spec 17 D3): 一番長い線分の中点。避けるもの・ほかのボタンと重なる時は、同じ線分の上で中点に近い順に BUTTON_GAP 刻みで試し、
 * どこでも重なれば次に長い線分へ。
 * どこにも置けなければ、線がボタンの中を通る範囲で、ボタンを線分と直交する向きに BUTTON_SHIFT_STEP 刻みでずらして同じ順に試す
 * (spec 19 P1: ノードの MARGIN 外を通る線分の上では、高さ 28 のボタンがノードに 2px かかり、隙間には回さない線のボタンがある)。
 * それでも置けなければ一番長い線分の中点
 */
function placeButton(
  pts: Point[],
  size: { width: number; height: number },
  avoid: Rect[],
  taken: Rect[]
): Point {
  const segs = pts
    .slice(1)
    .map((p, i) => ({ a: pts[i], b: p, len: Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y) }))
    .sort((s, t) => t.len - s.len);
  const others = avoid.concat(taken);
  /** 線分の上 (直交する向きに shift ずらした所) で置ける所 */
  const along = (s: (typeof segs)[number], shift: number): Point | null => {
    const vertical = s.a.x === s.b.x;
    const dx = vertical ? shift : 0;
    const dy = vertical ? 0 : shift;
    // この線分の上に置いたボタンが重なりうるものだけを先に選ぶ
    const reach: Rect = {
      x: Math.min(s.a.x, s.b.x) + dx - size.width / 2,
      y: Math.min(s.a.y, s.b.y) + dy - size.height / 2,
      width: Math.abs(s.b.x - s.a.x) + size.width,
      height: Math.abs(s.b.y - s.a.y) + size.height,
    };
    const near = others.filter((o) => rectsOverlap(reach, o));
    const mid = { x: (s.a.x + s.b.x) / 2 + dx, y: (s.a.y + s.b.y) / 2 + dy };
    const ux = Math.sign(s.b.x - s.a.x);
    const uy = Math.sign(s.b.y - s.a.y);
    for (let k = 0; k * ROUTE.BUTTON_GAP <= s.len / 2; k++) {
      for (const sign of k === 0 ? [0] : [-1, 1]) {
        const c = {
          x: mid.x + ux * sign * k * ROUTE.BUTTON_GAP,
          y: mid.y + uy * sign * k * ROUTE.BUTTON_GAP,
        };
        const r = rectAround(c, size);
        if (!near.some((o) => rectsOverlap(r, o))) return c;
      }
    }
    return null;
  };
  for (const s of segs) {
    const c = along(s, 0);
    if (c) return c;
  }
  for (const s of segs) {
    const across = s.a.x === s.b.x ? size.width : size.height;
    const limit = across / 2 - BUTTON_LINE_INSET;
    for (let d = BUTTON_SHIFT_STEP; d <= limit; d += BUTTON_SHIFT_STEP) {
      for (const shift of [-d, d]) {
        const c = along(s, shift);
        if (c) return c;
      }
    }
  }
  const s = segs[0];
  return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
}

export interface RouteOptions {
  /**
   * 線ごとの探索の結果 (離す前の道筋。回さない線は null)。渡すと書き込み、reuse にある線はここから使い回す (D4 の案 iii:
   * ドラッグ中は動いたものと関わる線だけを探し直す)
   */
  cache?: Map<string, Point[] | null>;
  reuse?: Set<string>;
}

/**
 * 回す線だけの経路。入っていない線は今の曲線のまま。自己ループ (枠の自己ループは frameSelfLoopPath) は扱わない
 */
export function routeEdges(
  boxes: RouteBox[],
  edges: RouteEdgeInput[],
  options: RouteOptions = {}
): Map<string, EdgeRoute> {
  const { cache, reuse } = options;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const paths = new Map<string, Point[]>();
  const views = new Map<string, EdgeView>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    const v = viewOf(byId, boxes, e);
    let pts: Point[] | null;
    if (cache && reuse?.has(e.id) && cache.has(e.id)) {
      const kept = cache.get(e.id);
      pts = kept ? kept.map((p) => ({ ...p })) : null;
    } else {
      pts = needsRoute(e, v) ? routeOne(e, v) : null;
      cache?.set(e.id, pts ? pts.map((p) => ({ ...p })) : null);
    }
    if (pts) {
      paths.set(e.id, pts);
      views.set(e.id, v);
    }
  }
  if (cache) {
    const live = new Set(edges.map((e) => e.id));
    Array.from(cache.keys()).forEach((id) => {
      if (!live.has(id)) cache.delete(id);
    });
  }
  // 離す・ボタンを置く時の避けるもの (広げない矩形と、通れる枠の見出し)
  const rawAvoid = new Map(
    Array.from(views).map(([id, v]) => [
      id,
      [...v.obstacles, ...v.ends, ...v.passable.filter((f) => f.frame).map(headerOf)] as Rect[],
    ])
  );
  separate(
    paths,
    rawAvoid,
    new Map(Array.from(views).map(([id, v]) => [id, v.passable.filter((f) => f.frame) as Rect[]]))
  );
  const out = new Map<string, EdgeRoute>();
  // 回さない線のボタンは動かさず、回した線のボタンがそれを避ける (spec 19 D3 の案 A')。自己ループは別の描き方なので入れない
  const taken: Rect[] = edges
    .filter((e) => e.source !== e.target && !paths.has(e.id))
    .map((e) => rectAround(curveLabel(e), e.button));
  const byEdge = new Map(edges.map((e) => [e.id, e]));
  for (const id of Array.from(paths.keys()).sort()) {
    const pts = simplify(paths.get(id)!);
    const size = byEdge.get(id)!.button;
    const label = placeButton(pts, size, rawAvoid.get(id)!, taken);
    taken.push({
      x: label.x - size.width / 2,
      y: label.y - size.height / 2,
      width: size.width,
      height: size.height,
    });
    out.set(id, { points: pts, label });
  }
  // 結果は線の順に並べる
  return new Map(edges.filter((e) => out.has(e.id)).map((e) => [e.id, out.get(e.id)!]));
}

/** 折れ線を、角を丸めた SVG の path にする */
export function roundedPath(pts: Point[], radius: number = ROUTE.CORNER): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    const r = pts[i + 1];
    const r1 = Math.min(radius, (Math.abs(q.x - p.x) + Math.abs(q.y - p.y)) / 2);
    const r2 = Math.min(radius, (Math.abs(r.x - q.x) + Math.abs(r.y - q.y)) / 2);
    const rr = Math.min(r1, r2);
    const inX = q.x - Math.sign(q.x - p.x) * rr;
    const inY = q.y - Math.sign(q.y - p.y) * rr;
    const outX = q.x + Math.sign(r.x - q.x) * rr;
    const outY = q.y + Math.sign(r.y - q.y) * rr;
    d += ` L ${inX} ${inY} Q ${q.x} ${q.y} ${outX} ${outY}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}
