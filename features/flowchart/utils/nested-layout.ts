/**
 * 枠 (サブグラフ) のある図の取り込み時の配置 (spec 15 D3、裁定 1: 今の段組みを入れ子に使う)。
 * 内側の枠から順に、枠の中を段組みで並べて枠の大きさを決め、外側では枠を 1 つの大きなノードとして同じ段組みで並べる。
 * 枠をまたぐ線は、両端の「同じ枠の中に並ぶ祖先」どうしの線とみなす。位置は xyflow と同じく、枠の中のものは枠の左上から、
 * 図の直下のものは図の原点から測る。
 * 枠の中は枠に書いた向き、無ければ置かれている側の向きで並べる (spec 16 D5、裁定 1 の案 B)
 */
import type { ParsedMermaidData } from "../hooks/mermaid";
import type { GraphType } from "../types/types";
import { toGraphType } from "./frame-direction";

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface NestedLayoutMetrics {
  /** ノード 1 つの大きさの見積もり (描く前なので測れない) */
  node: Size;
  /** ノードだけの段組みでの、段の送り (今の配置の段の間隔。ノードの大きさを含む) */
  pitchAlong: number;
  /** ノードだけの段組みでの、同じ段の中の送り (同上) */
  pitchAcross: number;
  /** 図の段の始まりの位置 */
  start: number;
  /** 図の同じ段の並びの中心 */
  center: number;
  /** 枠の内側の余白 */
  padding: number;
  /** 枠の見出しの高さ */
  titleHeight: number;
}

/** 並べる時の隙間の下限 */
export const MIN_GAP = 30;

export interface NestedLayout {
  /** ノードと枠の位置 (枠の中のものは枠の左上から) */
  positions: Map<string, Point>;
  /** 枠の大きさ */
  frameSizes: Map<string, Size>;
}

/** 整数に見える ID (0 から 2^32 − 2 の十進表記)。JS のオブジェクトのキーでは、入った順ではなく数の順で先頭に来る */
const isIndexKey = (k: string): boolean => /^(0|[1-9][0-9]*)$/.test(k) && Number(k) < 4294967295;

/** 枠のたどり始めの扱い (mermaidStartOrder)。anchor は、外とつながる枠の子孫のノードで最初に出てきたものの位置 */
export interface StartFrame {
  id: string;
  external: boolean;
  anchor: number;
}

/**
 * Mermaid (mermaid.js 11.17.2 の dagre、merman の dugong) が、輪をほどく時にたどり始める順 (spec 18 D1、裁定 1)。
 * flowDb の getData は、枠を枠の一覧の逆順で先に、続いてノードを最初に出てきた順にグラフへ入れ、graphlib はそれをオブジェクトのキーで持つ (P0 の 1)。
 * 外とつながる枠への線は枠の中のノードへ付け替わるので、その枠は中で最初に出てきたノードの所からたどる (P0 の c18)。
 * nodes は入れ物の直下のノード (最初に出てきた順)、at はノードの位置 (無ければ nodes の中の位置)
 */
export function mermaidStartOrder(
  nodes: string[],
  frames: StartFrame[] = [],
  at: Map<string, number> = new Map(nodes.map((id, i) => [id, i]))
): string[] {
  const head = frames
    .filter((f) => !f.external)
    .map((f) => f.id)
    .reverse();
  const rest = [
    ...nodes.map((id) => ({ id, at: at.get(id) ?? Infinity })),
    ...frames.filter((f) => f.external).map((f) => ({ id: f.id, at: f.anchor })),
  ]
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.id);
  const all = [...head, ...rest];
  const numeric = all.filter(isIndexKey).sort((a, b) => Number(a) - Number(b));
  return [...numeric, ...all.filter((id) => !isIndexKey(id))];
}

/**
 * 段の数え方 (spec 18、裁定 1・2)。
 * 1. 輪をほどく: startOrder の順にたどり始め、線を書いた順に深さ優先でたどり、たどっている途中の祖先へ戻る線を「戻る線」にする (dagre の dfsFAS)
 * 2. 戻る線を逆向きにした輪の無いグラフで、上からの最長路 (入る線の無いものが 0 段、ほかは入ってくる線の元の段 + 1 の最大)
 * 自己ループ (両端が同じ線) は 1 にも 2 にも入れない。戻る線を除く全部の線は 1 段以上下へ向き、戻る線は上へ戻る (段の条件)。
 * 返す Map の順 (同じ段の中の並び) は今までどおり、入る線の無いものから items の順に深さ優先で訪れた順、残り (輪) は startOrder の順にたどって訪れた順。
 * 今の段 (最初に着いた深さ) が段の条件を満たす輪の無い図では、段も並びも今と同じ (受け入れ条件 4)
 */
export function levelsOf(
  items: string[],
  edges: [string, string][],
  startOrder: string[] = items
): Map<string, number> {
  const inItems = new Set(items);
  const list = edges.filter(([a, b]) => inItems.has(a) && inItems.has(b));
  const real = list.filter(([a, b]) => a !== b);

  // 1. 戻る線 (dfsFAS)
  const outIndex = new Map<string, number[]>(items.map((id) => [id, []]));
  real.forEach(([a], i) => outIndex.get(a)!.push(i));
  const back = new Set<number>();
  const seen = new Set<string>();
  const onPath = new Set<string>();
  const unwind = (v: string): void => {
    if (seen.has(v)) return;
    seen.add(v);
    onPath.add(v);
    for (const i of outIndex.get(v) ?? []) {
      const w = real[i][1];
      if (onPath.has(w)) back.add(i);
      else unwind(w);
    }
    onPath.delete(v);
  };
  [...startOrder.filter((id) => inItems.has(id)), ...items].forEach(unwind);

  // 2. 上からの最長路 (トポロジカル順)
  const forward = real.map(([a, b], i): [string, string] => (back.has(i) ? [b, a] : [a, b]));
  const indegree = new Map(items.map((id) => [id, 0]));
  forward.forEach(([, b]) => indegree.set(b, indegree.get(b)! + 1));
  const level = new Map(items.map((id) => [id, 0]));
  const queue = items.filter((id) => indegree.get(id) === 0);
  const outs = new Map<string, string[]>(items.map((id) => [id, []]));
  forward.forEach(([a, b]) => outs.get(a)!.push(b));
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of outs.get(v)!) {
      level.set(w, Math.max(level.get(w)!, level.get(v)! + 1));
      indegree.set(w, indegree.get(w)! - 1);
      if (indegree.get(w) === 0) queue.push(w);
    }
  }

  // 同じ段の中の並び: 今までと同じ訪れた順 (自己ループも含めた線で、入る線の無いものから)
  const hasIncoming = new Set(list.map(([, b]) => b));
  const ordered = new Map<string, number>();
  const visit = (id: string): void => {
    if (ordered.has(id)) return;
    ordered.set(id, level.get(id)!);
    list.filter(([a]) => a === id).forEach(([, b]) => visit(b));
  };
  items.filter((id) => !hasIncoming.has(id)).forEach(visit);
  [...startOrder.filter((id) => inItems.has(id)), ...items].forEach(visit);
  return ordered;
}

/** 向きに沿った軸の取り方と、その向きの寸法での隙間 */
function axes(direction: GraphType, metrics: NestedLayoutMetrics) {
  const horizontal = direction === "LR" || direction === "RL";
  const reversed = direction === "BT" || direction === "RL";
  const along = (s: Size) => (horizontal ? s.width : s.height);
  const across = (s: Size) => (horizontal ? s.height : s.width);
  const toPoint = (a: number, c: number): Point => (horizontal ? { x: a, y: c } : { x: c, y: a });
  // 今の段組みの横の送り (250) はノードの幅 (240) とほぼ同じで、枠どうしが詰まりすぎるので隙間に下限を置く
  const gapAlong = Math.max(metrics.pitchAlong - along(metrics.node), MIN_GAP);
  const gapAcross = Math.max(metrics.pitchAcross - across(metrics.node), MIN_GAP);
  return { horizontal, reversed, along, across, toPoint, gapAlong, gapAcross };
}

/**
 * metrics は向きごとの寸法 (送りは向きで違う)。1 つだけ渡せば全部の向きで同じ寸法を使う
 */
export function layoutNested(
  data: ParsedMermaidData,
  direction: GraphType,
  metrics: NestedLayoutMetrics | ((direction: GraphType) => NestedLayoutMetrics)
): NestedLayout {
  const metricsOf = typeof metrics === "function" ? metrics : () => metrics;
  const rootMetrics = metricsOf(direction);

  const frames = data.subgraphs ?? [];
  const frameIds = new Set(frames.map((f) => f.id));
  const parentOf = new Map<string, string>();
  frames.forEach((f) => {
    if (f.parent !== undefined && frameIds.has(f.parent)) parentOf.set(f.id, f.parent);
    f.nodes.forEach((n) => parentOf.set(n, f.id));
  });
  const itemsOf = (container: string | undefined): string[] => [
    ...data.nodes.filter((n) => parentOf.get(n.id) === container).map((n) => n.id),
    ...frames.filter((f) => parentOf.get(f.id) === container).map((f) => f.id),
  ];
  /**
   * 輪をほどく時にたどり始める順 (spec 18 D1、裁定 1。mermaidStartOrder)。ノードの位置は最初に出てきた順 (data.nodes の順)、
   * 枠は枠の一覧の順。外とつながる枠 (spec 16: どれかの線の両端のちょうど片方が枠の子孫) は、子孫のノードで最初に出てきたものの所
   */
  const nodeAt = new Map(data.nodes.map((n, i) => [n.id, i]));
  const isDescendant = (id: string, frame: string): boolean => {
    const seen = new Set<string>();
    for (let p = parentOf.get(id); p !== undefined && !seen.has(p); p = parentOf.get(p)) {
      if (p === frame) return true;
      seen.add(p);
    }
    return false;
  };
  const startFrame = (id: string): StartFrame => {
    const external = data.edges.some(
      (e) => isDescendant(e.source, id) !== isDescendant(e.target, id)
    );
    const inside = data.nodes.filter((n) => isDescendant(n.id, id)).map((n) => nodeAt.get(n.id)!);
    return { id, external, anchor: inside.length > 0 ? Math.min(...inside) : Infinity };
  };
  const startOrderOf = (items: string[]): string[] =>
    mermaidStartOrder(
      items.filter((id) => !frameIds.has(id)),
      items.filter((id) => frameIds.has(id)).map(startFrame),
      nodeAt
    );
  /** その枠の中に並ぶ祖先 (自分を含む)。枠の外なら undefined */
  const liftTo = (id: string, container: string | undefined): string | undefined => {
    const seen = new Set<string>();
    for (
      let cur: string | undefined = id;
      cur !== undefined && !seen.has(cur);
      cur = parentOf.get(cur)
    ) {
      if (parentOf.get(cur) === container) return cur;
      seen.add(cur);
    }
    return undefined;
  };

  const positions = new Map<string, Point>();
  const frameSizes = new Map<string, Size>();

  /** 入れ物 (図・枠) の中の向き。枠に書いた向き、無ければ置かれている側の向き。親子が輪なら図の向き */
  const byFrame = new Map(frames.map((f) => [f.id, f]));
  const directionOf = (container: string | undefined, seen = new Set<string>()): GraphType => {
    if (container === undefined || seen.has(container)) return direction;
    const written = byFrame.get(container)?.direction;
    if (written) return toGraphType(written);
    seen.add(container);
    return directionOf(parentOf.get(container), seen);
  };

  /** 枠 (または図) の中を並べ、中身の位置 (まだ原点合わせ前) と外接矩形を返す */
  const arrange = (container: string | undefined) => {
    const dir = directionOf(container);
    const metrics = metricsOf(dir);
    const { reversed, along, across, toPoint, gapAlong, gapAcross } = axes(dir, metrics);
    const items = itemsOf(container);
    const sizeOf = (id: string): Size => (frameIds.has(id) ? frameSize(id) : metrics.node);
    const pairs = new Map<string, [string, string]>();
    data.edges.forEach((e) => {
      const a = liftTo(e.source, container);
      const b = liftTo(e.target, container);
      if (a !== undefined && b !== undefined && a !== b) pairs.set(`${a}\u0000${b}`, [a, b]);
    });
    const levels = levelsOf(items, Array.from(pairs.values()), startOrderOf(items));
    const byLevel = new Map<number, string[]>();
    levels.forEach((level, id) => byLevel.set(level, [...(byLevel.get(level) ?? []), id]));
    const order = Array.from(byLevel.keys()).sort((a, b) => (reversed ? b - a : a - b));

    const local = new Map<string, Point>();
    let cursor = 0;
    order.forEach((level) => {
      const ids = byLevel.get(level) ?? [];
      const thickness = Math.max(...ids.map((id) => along(sizeOf(id))));
      const total =
        ids.reduce((sum, id) => sum + across(sizeOf(id)), 0) + gapAcross * (ids.length - 1);
      let c = -total / 2;
      ids.forEach((id) => {
        const size = sizeOf(id);
        local.set(id, toPoint(cursor + (thickness - along(size)) / 2, c));
        c += across(size) + gapAcross;
      });
      cursor += thickness + gapAlong;
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    local.forEach((p, id) => {
      const size = sizeOf(id);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + size.width);
      maxY = Math.max(maxY, p.y + size.height);
    });
    return { local, box: local.size > 0 ? { minX, minY, maxX, maxY } : null };
  };

  const frameSize = (id: string): Size => {
    const known = frameSizes.get(id);
    if (known) return known;
    const { local, box } = arrange(id);
    const metrics = metricsOf(directionOf(id));
    const pad = metrics.padding;
    const top = pad + metrics.titleHeight;
    local.forEach((p, child) =>
      positions.set(child, { x: p.x - (box?.minX ?? 0) + pad, y: p.y - (box?.minY ?? 0) + top })
    );
    // 空の枠はノード 1 つ分の大きさ (中へ入れられるように)
    const inner = box ? { width: box.maxX - box.minX, height: box.maxY - box.minY } : metrics.node;
    const size = { width: inner.width + pad * 2, height: inner.height + top + pad };
    frameSizes.set(id, size);
    return size;
  };

  const root = arrange(undefined);
  const { horizontal, toPoint } = axes(direction, rootMetrics);
  root.local.forEach((p, id) => {
    const a = horizontal ? p.x : p.y;
    const c = horizontal ? p.y : p.x;
    positions.set(id, toPoint(a + rootMetrics.start, c + rootMetrics.center));
  });
  return { positions, frameSizes };
}
