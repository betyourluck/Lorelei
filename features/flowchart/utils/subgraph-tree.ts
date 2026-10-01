/**
 * サブグラフ (枠) の親子を扱う純粋な関数 (spec 15 D1)。取り込み・配置・生成器で共用する
 */

/** 枠のノードの種類 (xyflow の親)。data は { variableName, title } */
export const SUBGRAPH_NODE_TYPE = "subgraphNode";

export interface ParentLink {
  id: string;
  parent?: string;
}

const withoutParent = <T extends ParentLink>(item: T): T => {
  const { parent: _parent, ...rest } = item;
  return rest as T;
};

/**
 * 親が子より前に来るように並べ直す (xyflow は親が後ろにあると子の位置を計算しない)。
 * mermaid.js も merman も内側の枠を先に並べるので、元の順には頼らない。
 * 親が一覧に無い・親子が輪になる枠は、親を外して図の直下に置く
 */
export function orderParentsFirst<T extends ParentLink>(items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const placed = new Set<string>();
  const path = new Set<string>();
  const out: T[] = [];
  const place = (item: T): void => {
    if (placed.has(item.id)) return;
    let result = item;
    if (item.parent !== undefined) {
      const parent = byId.get(item.parent);
      if (!parent || path.has(parent.id)) {
        result = withoutParent(item);
      } else {
        path.add(item.id);
        place(parent);
        path.delete(item.id);
        // 自分を親にした枠は、親を辿る途中で (親を外して) もう置かれている
        if (placed.has(item.id)) return;
      }
    }
    placed.add(item.id);
    out.push(result);
  };
  items.forEach(place);
  return out;
}

interface FrameLike {
  id: string;
  type?: string;
  parentId?: string;
  data: Record<string, unknown>;
}

/**
 * 中に何も無い枠の名前 (題、空なら ID)。空の枠は Mermaid の描画 (mermaid.js・書き出し) で
 * 枠ではなく四角いノードになるので、コード生成で知らせる (spec 15 D7、裁定 4)
 */
export function emptyFrameNames(nodes: FrameLike[]): string[] {
  const parents = new Set(nodes.map((n) => n.parentId).filter((p): p is string => p !== undefined));
  return nodes
    .filter((n) => n.type === SUBGRAPH_NODE_TYPE && !parents.has(n.id))
    .map((n) => String(n.data.title || n.data.variableName || n.id));
}

/**
 * 枠と自分の中 (子孫) を結ぶ線か (spec 16 裁定 2)。mermaid.js も merman も誤りにしないが、描画では長さ 0 の線になって見えず、
 * それでいて枠を「外とつながる」扱いにして中の向きを変える (P0)。枠の自己ループ (端が同じ枠) は描かれるので当たらない
 */
export function edgeIntoOwnFrame(
  source: string,
  target: string,
  isFrame: (id: string) => boolean,
  parentOf: (id: string) => string | undefined
): boolean {
  if (source === target) return false;
  return (
    (isFrame(source) && ancestorsOf(target, parentOf).includes(source)) ||
    (isFrame(target) && ancestorsOf(source, parentOf).includes(target))
  );
}

/** 自分から根までの祖先の ID (近い順)。輪になっていても止まる */
export function ancestorsOf(id: string, parentOf: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set([id]);
  for (let p = parentOf(id); p !== undefined && !seen.has(p); p = parentOf(p)) {
    out.push(p);
    seen.add(p);
  }
  return out;
}
