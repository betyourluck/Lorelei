/**
 * spec 22: 速くする前の search (edge-route.ts、2026-10-14 の HEAD 36da14d) の写し。参照の実装として、速くした search が同じ道を返すかを比べる。
 * 1 字も変えずに写した (名前と書き出しだけ変えた)。edge-route.ts の search の道の選び方を変える時は、この写しも同じに変える
 */
import { ROUTE } from "@/features/flowchart/utils/edge-route";
import type { Point } from "@/features/flowchart/utils/frame-edit";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 座標の誤差の幅 (edge-route.ts と同じ) */
const EDGE_EPS = 1e-6;

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

const OPPOSITE = [1, 0, 3, 2];
/** 同じ重みなら右・下を先に取るための、ごく小さな重み (道のりの選び方は変えない) */
const TIE = [0, 1e-6, 0, 1e-6];

export function searchReference(
  a: Point,
  aDir: number,
  b: Point,
  bDir: number,
  avoid: Rect[]
): Point[] | null {
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
