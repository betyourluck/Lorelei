/**
 * 枠 (サブグラフ) の GUI の編集の計算 (spec 15 D5)。xyflow のノードの配列を受けて新しい配列を返す純粋な関数。
 * 枠は xyflow の親ノードで、中のノードの position は親からの相対。親は子より前に並べる (xyflow の決まり)
 */
import type { Edge, Node } from "@xyflow/react";
import { getSafeVariableName, type ParsedMermaidData } from "../hooks/mermaid";
import type { GraphType, SubgraphDirection } from "../types/types";
import { layoutNested, type NestedLayoutMetrics } from "./nested-layout";
import { edgeIntoOwnFrame, SUBGRAPH_NODE_TYPE } from "./subgraph-tree";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 枠の内側の余白と見出しの高さ (取り込み時の配置 nestedLayoutMetrics と同じ) */
export const FRAME_PADDING = 24;
export const FRAME_TITLE_HEIGHT = 28;
/**
 * 枠のノードの style。枠の本体は押す操作を受けない (見出し・つまみ・× だけが受ける)。
 * xyflow は線のラベル (線のボタン) をノードより下の層に描くので、枠の本体が受けると、枠の中の線のボタン・線・空いている所が押せない
 * (2026-09-30 配布ビルドで利用者が見つけた, failures #25)
 */
export const FRAME_NODE_STYLE = { pointerEvents: "none" } as const;

/** 「枠を追加」の大きさ (D5) */
export const NEW_FRAME_SIZE: Size = { width: 320, height: 200 };
/** 描く前のノードの大きさの見積もり (w="xs" の 240、高さの最小 48。P1 で測った) */
const NODE_SIZE: Size = { width: 240, height: 48 };

export const isFrame = (node: Node | undefined): boolean => node?.type === SUBGRAPH_NODE_TYPE;

/** 大きさ。枠は width / height、ノードは測った大きさ (まだ測っていなければ見積もり) */
export const sizeOf = (node: Node): Size => ({
  width: node.width ?? node.measured?.width ?? NODE_SIZE.width,
  height: node.height ?? node.measured?.height ?? NODE_SIZE.height,
});

/** 親の ID (一覧にある枠だけ) */
const parentIdOf = (byId: Map<string, Node>, node: Node): string | undefined =>
  node.parentId !== undefined && isFrame(byId.get(node.parentId)) ? node.parentId : undefined;

/** 絶対位置。親の position を根まで足す。親が見つからない・輪になる所で足すのをやめる */
export function absolutePositions(nodes: Node[]): Map<string, Point> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, Point>();
  const abs = (n: Node, seen: Set<string>): Point => {
    const known = memo.get(n.id);
    if (known) return known;
    const parent = n.parentId !== undefined ? byId.get(n.parentId) : undefined;
    let p: Point = { x: n.position.x, y: n.position.y };
    if (parent && !seen.has(parent.id)) {
      const q = abs(parent, new Set(Array.from(seen).concat(n.id)));
      p = { x: p.x + q.x, y: p.y + q.y };
    }
    memo.set(n.id, p);
    return p;
  };
  nodes.forEach((n) => abs(n, new Set()));
  return memo;
}

/** 自分の子孫 (枠の中の枠の中まで) の ID */
export function descendantsOf(nodes: Node[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (n.parentId !== undefined)
      children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  });
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (out.has(cur) || cur === id) continue;
    out.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}

/** 親が子より前に来るように並べ直す。それ以外の順は保つ (生成器は配列の順に書く) */
export function sortParentsFirst(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set<string>();
  const path = new Set<string>();
  const out: Node[] = [];
  const place = (n: Node): void => {
    if (placed.has(n.id)) return;
    const parent = n.parentId !== undefined ? byId.get(n.parentId) : undefined;
    if (parent && !path.has(parent.id)) {
      path.add(n.id);
      place(parent);
      path.delete(n.id);
      if (placed.has(n.id)) return;
    }
    placed.add(n.id);
    out.push(n);
  };
  nodes.forEach(place);
  return out;
}

/**
 * ドロップした先の枠 (D5)。ノード (または枠) の中心を含む枠のうち一番内側のもの (深い方、同じ深さなら小さい方)。
 * 自分自身と自分の子孫の枠は候補から外す (親子が輪になるのを防ぐ)。どの枠にも入らなければ undefined
 */
export function dropTarget(nodes: Node[], id: string): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (!node) return undefined;
  const abs = absolutePositions(nodes);
  const excluded = descendantsOf(nodes, id);
  excluded.add(id);
  const size = sizeOf(node);
  const p = abs.get(id)!;
  const center = { x: p.x + size.width / 2, y: p.y + size.height / 2 };
  const depth = (n: Node): number => {
    let d = 0;
    const seen = new Set<string>();
    for (
      let cur = parentIdOf(byId, n);
      cur !== undefined && !seen.has(cur);
      cur = parentIdOf(byId, byId.get(cur)!)
    ) {
      seen.add(cur);
      d++;
    }
    return d;
  };
  let best: { id: string; depth: number; area: number } | undefined;
  nodes.forEach((f) => {
    if (!isFrame(f) || excluded.has(f.id)) return;
    const q = abs.get(f.id)!;
    const s = sizeOf(f);
    if (center.x < q.x || center.y < q.y || center.x > q.x + s.width || center.y > q.y + s.height)
      return;
    const cand = { id: f.id, depth: depth(f), area: s.width * s.height };
    if (!best || cand.depth > best.depth || (cand.depth === best.depth && cand.area < best.area))
      best = cand;
  });
  return best?.id;
}

/**
 * 枠を中身に合わせて広げる (はみ出した分だけ。縮めない)。左・上にはみ出した時は枠を動かし、中身の相対位置をずらして絶対位置を保つ。
 * 枠の位置・大きさが変わると親の枠からはみ出しうるので、親へ向かって繰り返す
 */
export function fitFrames(nodes: Node[], frameId: string | undefined): Node[] {
  let out = nodes;
  const seen = new Set<string>();
  for (let id = frameId; id !== undefined && !seen.has(id); ) {
    seen.add(id);
    const byId = new Map(out.map((n) => [n.id, n]));
    const frame = byId.get(id);
    if (!isFrame(frame)) break;
    const children = out.filter((n) => n.parentId === id);
    if (children.length > 0) {
      const minX = Math.min(...children.map((c) => c.position.x));
      const minY = Math.min(...children.map((c) => c.position.y));
      const dx = Math.max(0, FRAME_PADDING - minX);
      const dy = Math.max(0, FRAME_PADDING + FRAME_TITLE_HEIGHT - minY);
      const maxX = Math.max(...children.map((c) => c.position.x + sizeOf(c).width)) + dx;
      const maxY = Math.max(...children.map((c) => c.position.y + sizeOf(c).height)) + dy;
      const size = sizeOf(frame!);
      const width = Math.max(size.width + dx, maxX + FRAME_PADDING);
      const height = Math.max(size.height + dy, maxY + FRAME_PADDING);
      if (dx > 0 || dy > 0 || width !== size.width || height !== size.height) {
        out = out.map((n) => {
          if (n.id === id)
            return {
              ...n,
              position: { x: n.position.x - dx, y: n.position.y - dy },
              width,
              height,
            };
          if (n.parentId === id && (dx > 0 || dy > 0))
            return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
          return n;
        });
      }
    }
    id = parentIdOf(new Map(out.map((n) => [n.id, n])), frame!);
  }
  return out;
}

/**
 * ドラッグを終えたノード (複数可) の親を付け替える (D5)。中心を含む一番内側の枠を新しい親にし、どの枠にも入らなければ図の直下へ。
 * 付け替えた時は絶対位置を保つように相対位置を直す。付け替えなくても、枠からはみ出した分だけ枠を広げる。
 * 一緒にドラッグした祖先があるノードは、祖先と一緒に動いただけなので付け替えない
 */
export function applyDrop(nodes: Node[], draggedIds: string[]): Node[] {
  const dragged = new Set(draggedIds);
  let out = nodes;
  for (const id of draggedIds) {
    const byId = new Map(out.map((n) => [n.id, n]));
    const node = byId.get(id);
    if (!node) continue;
    const ancestorDragged = (() => {
      const seen = new Set<string>();
      for (
        let p = parentIdOf(byId, node);
        p !== undefined && !seen.has(p);
        p = parentIdOf(byId, byId.get(p)!)
      ) {
        if (dragged.has(p)) return true;
        seen.add(p);
      }
      return false;
    })();
    if (ancestorDragged) continue;
    const target = dropTarget(out, id);
    const current = parentIdOf(byId, node);
    if (target !== current) {
      const abs = absolutePositions(out);
      const me = abs.get(id)!;
      const base = target !== undefined ? abs.get(target)! : { x: 0, y: 0 };
      out = out.map((n) => {
        if (n.id !== id) return n;
        const { parentId: _old, ...rest } = n;
        const moved = { ...rest, position: { x: me.x - base.x, y: me.y - base.y } };
        return target !== undefined ? { ...moved, parentId: target } : moved;
      });
    }
    out = fitFrames(out, target);
  }
  return sortParentsFirst(out);
}

export interface FrameDeletePlan {
  /** 実際に消すノード (選んだものと、選んでいない子を除いた巻き添え) */
  remove: Node[];
  /** 実際に消す線 (消すノードにつながる線と、選んだ線) */
  removeEdges: Edge[];
  /** 消す枠 */
  frames: Node[];
  /** 残して 1 段上へ移す子 (ノードと枠) の数 */
  kept: number;
  /** 付け替えた後のノードの配列 (消す前の状態に当てる) */
  reparent: (nodes: Node[]) => Node[];
}

/**
 * 枠を消す時の計画 (D5、裁定 3)。xyflow は親を消すと子も消す一覧を渡してくるので、選んでいない子は消す一覧から外し、
 * 消す枠の親 (無ければ図の直下) へ付け替えて残す。絶対位置は保つ。子の枠も中身ごと 1 段上へ (平らにはしない)。
 * 消す一覧の根 (親が消す一覧に無いもの = 呼び手が消すと言ったもの) は消す。選ばれて (selected) いる子は、
 * 選択を消した時 (Backspace) だけ一緒に消す。枠の × やメニューで名指しして消した時 (bySelection: false) は子の選択を見ない
 * (× を押した時点では、直前に選んだ中のノードの選択がまだ残っている。2026-09-30 tauri dev で利用者が見つけた)
 */
export function planFrameDelete(
  all: Node[],
  requested: Node[],
  requestedEdges: Edge[],
  { bySelection = true }: { bySelection?: boolean } = {}
): FrameDeletePlan {
  const requestedIds = new Set(requested.map((n) => n.id));
  const isRoot = (n: Node) => n.parentId === undefined || !requestedIds.has(n.parentId);
  const remove = requested.filter((n) => isRoot(n) || (bySelection && n.selected));
  const removeIds = new Set(remove.map((n) => n.id));
  const frames = remove.filter((n) => isFrame(n));
  const frameIds = new Set(frames.map((f) => f.id));
  const byId = new Map(all.map((n) => [n.id, n]));
  /** 消えない一番近い祖先 (無ければ図の直下) */
  const survivingParent = (n: Node): string | undefined => {
    const seen = new Set<string>();
    for (let p = n.parentId; p !== undefined && !seen.has(p); p = byId.get(p)?.parentId) {
      if (!removeIds.has(p)) return byId.has(p) ? p : undefined;
      seen.add(p);
    }
    return undefined;
  };
  // 付け替えるのは、親が消えて自分は残る子 (直下の子だけ。孫はその子と一緒に動く)
  const moving = all.filter(
    (n) => n.parentId !== undefined && frameIds.has(n.parentId) && !removeIds.has(n.id)
  );
  // 残るもの = 消す枠の子孫 (中の枠の中まで) のうち消さないもの
  const survivors = new Set<string>();
  frames.forEach((f) =>
    descendantsOf(all, f.id).forEach((d) => !removeIds.has(d) && survivors.add(d))
  );
  const kept = survivors.size;
  const removeEdges = requestedEdges.filter(
    (e) => removeIds.has(e.source) || removeIds.has(e.target) || e.selected
  );
  const reparent = (nodes: Node[]): Node[] => {
    if (moving.length === 0) return nodes;
    const abs = absolutePositions(nodes);
    const movingIds = new Set(moving.map((n) => n.id));
    const current = new Map(nodes.map((n) => [n.id, n]));
    return sortParentsFirst(
      nodes.map((n) => {
        if (!movingIds.has(n.id)) return n;
        const target = survivingParent(current.get(n.id) ?? n);
        const me = abs.get(n.id) ?? n.position;
        const base = target !== undefined ? (abs.get(target) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
        const { parentId: _old, ...rest } = n;
        const moved = { ...rest, position: { x: me.x - base.x, y: me.y - base.y } };
        return target !== undefined ? { ...moved, parentId: target } : moved;
      })
    );
  };
  return { remove, removeEdges, frames, kept, reparent };
}

/**
 * 枠と自分の中 (子孫) を結ぶ線か (spec 16 裁定 2)。Mermaid の描画で見えず、枠の中の向きを変えるので、作らせない・書き出さない。
 * 枠の自己ループは当たらない
 */
export function intoOwnFrame(nodes: Node[], source: string, target: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edgeIntoOwnFrame(
    source,
    target,
    (id) => isFrame(byId.get(id)),
    (id) => {
      const node = byId.get(id);
      return node ? parentIdOf(byId, node) : undefined;
    }
  );
}

/** ドラッグで付け替えた結果、新たに枠と自分の中を結ぶようになった線 (D7。確かめてから消す) */
export function edgesBrokenByDrop(before: Node[], after: Node[], edges: Edge[]): Edge[] {
  return edges.filter(
    (e) => intoOwnFrame(after, e.source, e.target) && !intoOwnFrame(before, e.source, e.target)
  );
}

export type HandleSide = "top" | "bottom" | "left" | "right";

/**
 * 枠の自己ループの道筋 (spec 16 P3)。xyflow の曲線のままだと、出口 (下) から入口 (上) へ枠の真ん中を縦に貫く。
 * 出口と入口が上下にあれば枠の右の外を、左右にあれば枠の下の外を回る。座標は図の座標 (線と同じ)
 */
export function frameSelfLoopPath(
  box: { x: number; y: number; width: number; height: number },
  source: Point,
  target: Point,
  sourceSide: HandleSide
): { path: string; labelX: number; labelY: number } {
  const step = 20;
  const gap = 40;
  const p = (pts: Point[]) => pts.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" ");
  if (sourceSide === "top" || sourceSide === "bottom") {
    const out = sourceSide === "bottom" ? step : -step;
    const side = box.x + box.width + gap;
    return {
      path: p([
        source,
        { x: source.x, y: source.y + out },
        { x: side, y: source.y + out },
        { x: side, y: target.y - out },
        { x: target.x, y: target.y - out },
        target,
      ]),
      labelX: side,
      labelY: box.y + box.height / 2,
    };
  }
  const out = sourceSide === "right" ? step : -step;
  const below = box.y + box.height + gap;
  return {
    path: p([
      source,
      { x: source.x + out, y: source.y },
      { x: source.x + out, y: below },
      { x: target.x - out, y: below },
      { x: target.x - out, y: target.y },
      target,
    ]),
    labelX: box.x + box.width / 2,
    labelY: below,
  };
}

/**
 * 枠の向きを変えた時に、その枠の中だけを取り込み時と同じ段組み (layoutNested) で並べ直す (spec 16 P5、裁定 4)。
 * direction はその枠の中の新しい向き (「指定なし」なら置かれている側の向き)。枠の左上は動かさず、大きさは中身に合わせ、
 * 中の枠も並べ直す (向きを書いていない中の枠は新しい向きを継ぐ)。広がって外側の枠からはみ出したら外側を広げる
 */
export function relayoutFrame(
  nodes: Node[],
  edges: Edge[],
  frameId: string,
  direction: GraphType,
  metrics: NestedLayoutMetrics | ((direction: GraphType) => NestedLayoutMetrics)
): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!isFrame(byId.get(frameId))) return nodes;
  const inside = descendantsOf(nodes, frameId);
  const members = nodes.filter((n) => inside.has(n.id));
  const directOf = (parent: string) =>
    members.filter((n) => n.parentId === parent && !isFrame(n)).map((n) => n.id);
  const writtenOf = (n: Node): SubgraphDirection | undefined => {
    const d = (n.data as { direction?: unknown }).direction;
    return d === "TB" || d === "BT" || d === "LR" || d === "RL" ? d : undefined;
  };
  const data: ParsedMermaidData = {
    nodes: members
      .filter((n) => !isFrame(n))
      .map((n) => ({ id: n.id, variableName: n.id, label: "", shapeType: "rectangle" })),
    edges: edges
      .filter((e) => inside.has(e.source) && inside.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: "",
        arrowType: "arrow",
      })),
    subgraphs: [
      {
        id: frameId,
        title: "",
        nodes: directOf(frameId),
        direction: direction === "TD" ? "TB" : direction,
      },
      ...members.filter(isFrame).map((f) => {
        const written = writtenOf(f);
        return {
          id: f.id,
          title: "",
          nodes: directOf(f.id),
          ...(f.parentId !== undefined ? { parent: f.parentId } : {}),
          ...(written ? { direction: written } : {}),
        };
      }),
    ],
  };
  const { positions, frameSizes } = layoutNested(data, direction, metrics);
  const moved = nodes.map((n) => {
    if (n.id === frameId) {
      const size = frameSizes.get(n.id);
      return size ? { ...n, width: size.width, height: size.height } : n;
    }
    if (!inside.has(n.id)) return n;
    const p = positions.get(n.id);
    const size = frameSizes.get(n.id);
    return {
      ...n,
      ...(p ? { position: p } : {}),
      ...(size ? { width: size.width, height: size.height } : {}),
    };
  });
  return fitFrames(moved, parentIdOf(byId, byId.get(frameId)!));
}

/** 使っていない最小の番号で、新しい枠の Mermaid 上の ID (group{N}) と題 (グループ{N}) を決める (D5) */
export function nextFrameName(nodes: Node[]): { variableName: string; title: string } {
  const used = new Set(
    nodes.map((n) =>
      getSafeVariableName(String((n.data as { variableName?: unknown }).variableName ?? ""))
    )
  );
  let n = 1;
  while (used.has(`group${n}`)) n++;
  return { variableName: `group${n}`, title: `グループ${n}` };
}

/** 枠の ID の候補がほかのノード・枠の ID とぶつかるか (空も確定させない) */
export function frameNameRejected(nodes: Node[], frameId: string, name: string): boolean {
  if (name.trim() === "") return true;
  const safe = getSafeVariableName(name);
  return nodes.some(
    (n) =>
      n.id !== frameId &&
      getSafeVariableName(
        String(
          (n.data as { variableName?: unknown }).variableName ||
            (isFrame(n) ? `group${n.id}` : `node${n.id}`)
        )
      ) === safe
  );
}
