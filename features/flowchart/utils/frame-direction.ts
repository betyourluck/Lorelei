/**
 * 枠 (サブグラフ) の中の向き (spec 16 D4・D6)。エディタの節点の配列を受ける純粋な関数。
 * - エディタの向き (裁定 1 の案 B): 枠に書いた向き、無ければ置かれている側の向き。並べ・接続点はこれを読む
 * - 描画で効く向き: Mermaid の描画 (mermaid.js・merman とも) がその枠の中を並べる向き。見出しの知らせだけに使う。
 *   規則は P0 の 4 で、両方の実装の描画を測った 520 点と一致したもの (spec 16「P0 結果」)
 */
import type { Edge, Node } from "@xyflow/react";
import type { GraphType, SubgraphDirection } from "../types/types";
import { edgeIntoOwnFrame, SUBGRAPH_NODE_TYPE } from "./subgraph-tree";

const isFrameNode = (node: Node | undefined): boolean => node?.type === SUBGRAPH_NODE_TYPE;

/** 枠に書いた向き (無ければ undefined) */
const writtenDirection = (node: Node): SubgraphDirection | undefined => {
  const d = (node.data as { direction?: unknown }).direction;
  return d === "TB" || d === "BT" || d === "LR" || d === "RL" ? d : undefined;
};

/** 枠の向きを図の向きの言葉にする (TB は TD と同じ意味) */
export const toGraphType = (d: SubgraphDirection): GraphType => (d === "TB" ? "TD" : d);
const toSubgraphDirection = (d: GraphType): SubgraphDirection => (d === "TD" ? "TB" : d);

/** 一覧にある枠の親 (枠でない親・見つからない親は持たない)。親子が輪になる所では辿るのをやめる */
function parentLookup(nodes: Node[]): (id: string) => string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => {
    const parentId = byId.get(id)?.parentId;
    return parentId !== undefined && isFrameNode(byId.get(parentId)) ? parentId : undefined;
  };
}

/** 親を辿って向きを決める。輪になったら図の向きにする */
function resolveDown<T>(
  nodes: Node[],
  root: T,
  own: (frame: Node, outer: T, id: string) => T
): Map<string, T> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = parentLookup(nodes);
  const memo = new Map<string, T>();
  const visiting = new Set<string>();
  const inner = (id: string): T => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return root;
    visiting.add(id);
    const parent = parentOf(id);
    const outer = parent !== undefined ? inner(parent) : root;
    const value = own(byId.get(id)!, outer, id);
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  const out = new Map<string, T>();
  nodes.filter(isFrameNode).forEach((f) => out.set(f.id, inner(f.id)));
  return out;
}

/** エディタでの枠の中の向き (裁定 1 の案 B)。書いた向き、無ければ置かれている側の向き */
export function frameInnerDirections(nodes: Node[], direction: GraphType): Map<string, GraphType> {
  return resolveDown(nodes, direction, (frame, outer) => {
    const written = writtenDirection(frame);
    return written ? toGraphType(written) : outer;
  });
}

/** 接続点の向き (D6)。ノード・枠とも、置かれている入れ物 (親の枠、無ければ図) の向き */
export function handleDirections(nodes: Node[], direction: GraphType): Map<string, GraphType> {
  const inner = frameInnerDirections(nodes, direction);
  const parentOf = parentLookup(nodes);
  return new Map(
    nodes.map((n) => {
      const parent = parentOf(n.id);
      return [n.id, parent !== undefined ? (inner.get(parent) ?? direction) : direction];
    })
  );
}

/**
 * Mermaid の描画で枠の中が並ぶ向き (P0 の 4)。中身の無い枠は null (描画では四角いノード)。
 * - 外とつながる枠 (線の両端のちょうど片方が枠の子孫。端が枠そのものの線は、その枠自身にとっては外の端) は、置かれている側の向き
 * - それ以外は書いた向き、無ければ置かれている側の向きが TB なら LR、それ以外なら TB
 * 枠と自分の中を結ぶ線は書き出されない (裁定 2) ので数えない
 */
export function effectiveDirections(
  nodes: Node[],
  edges: Edge[],
  direction: GraphType
): Map<string, SubgraphDirection | null> {
  const parentOf = parentLookup(nodes);
  const frameIds = new Set(nodes.filter(isFrameNode).map((n) => n.id));
  const hasChildren = new Set(
    nodes.map((n) => parentOf(n.id)).filter((p): p is string => p !== undefined)
  );
  const written = edges.filter(
    (e) => !edgeIntoOwnFrame(e.source, e.target, (id) => frameIds.has(id), parentOf)
  );
  /** id が枠 frame の子孫か (frame 自身は含まない) */
  const inside = (id: string, frame: string): boolean => {
    const seen = new Set<string>([id]);
    for (let p = parentOf(id); p !== undefined && !seen.has(p); p = parentOf(p)) {
      if (p === frame) return true;
      seen.add(p);
    }
    return false;
  };
  const external = (frame: string): boolean =>
    written.some((e) => inside(e.source, frame) !== inside(e.target, frame));
  const root = toSubgraphDirection(direction);
  // 枠の中身が並ぶ向き。中身の無い枠は、その中に並ぶものが無いので置かれている側の向きを素通しにする
  const layout = resolveDown<SubgraphDirection>(nodes, root, (frame, outer, id) => {
    if (!hasChildren.has(id) || external(id)) return outer;
    return writtenDirection(frame) ?? (outer === "TB" ? "LR" : "TB");
  });
  const out = new Map<string, SubgraphDirection | null>();
  layout.forEach((d, id) => out.set(id, hasChildren.has(id) ? d : null));
  return out;
}

const WORDS: Record<SubgraphDirection, string> = {
  TB: "上から下",
  BT: "下から上",
  LR: "左から右",
  RL: "右から左",
};

/**
 * 見出しの知らせ (D4)。エディタの向きと描画で効く向きが違う枠にだけ出す。
 * 理由は 2 つ: 中のノードが外とつながって書いた向きが効かない / 外とつながらない、向きの無い枠は描画で逆向きになる。
 * 外側の枠の食い違いを受け継いだだけの枠には出さない (外側の枠に出る)
 */
export function frameDirectionNotice(
  nodes: Node[],
  edges: Edge[],
  direction: GraphType
): Map<string, string> {
  const effective = effectiveDirections(nodes, edges, direction);
  const editor = frameInnerDirections(nodes, direction);
  const parentOf = parentLookup(nodes);
  const childCount = new Map<string, number>();
  nodes.forEach((n) => {
    const p = parentOf(n.id);
    if (p !== undefined) childCount.set(p, (childCount.get(p) ?? 0) + 1);
  });
  const out = new Map<string, string>();
  nodes.filter(isFrameNode).forEach((frame) => {
    // 中身が 1 つなら、どの向きで並べても見た目は同じ (spec 16 P3)
    if ((childCount.get(frame.id) ?? 0) < 2) return;
    const drawn = effective.get(frame.id);
    const mine = editor.get(frame.id);
    if (!drawn || !mine || toSubgraphDirection(mine) === drawn) return;
    const written = writtenDirection(frame);
    if (written) {
      out.set(
        frame.id,
        `中のノードが枠の外とつながっているので、描画ではこの向き（${written}）は効きません（${drawn} で並びます）`
      );
      return;
    }
    // 向きの無い枠: 置かれている側と同じ向きで描かれるなら食い違いは外側のもの
    const parent = parentLookup(nodes)(frame.id);
    const outerDrawn =
      parent !== undefined ? effective.get(parent) : toSubgraphDirection(direction);
    if (outerDrawn === drawn) return;
    out.set(
      frame.id,
      `描画では、この枠の中は ${drawn}（${WORDS[drawn]}）に並びます。向きを指定すると揃えられます`
    );
  });
  return out;
}
