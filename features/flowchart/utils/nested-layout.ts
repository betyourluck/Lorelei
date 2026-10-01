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

/** 今の段組み (flow-editor の layoutNodes) と同じ段の数え方: 入る線の無いものを根にして深さ優先で段を振り、振った段は大きい方を採る */
export function levelsOf(items: string[], edges: [string, string][]): Map<string, number> {
  const hasIncoming = new Set(edges.map(([, target]) => target));
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (id: string, level: number): void => {
    if (visited.has(id)) return;
    visited.add(id);
    levels.set(id, Math.max(levels.get(id) ?? 0, level));
    edges.filter(([source]) => source === id).forEach(([, target]) => visit(target, level + 1));
  };
  items.filter((id) => !hasIncoming.has(id)).forEach((id) => visit(id, 0));
  items.forEach((id) => {
    if (!levels.has(id)) levels.set(id, 0);
  });
  return levels;
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
    const levels = levelsOf(items, Array.from(pairs.values()));
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
