/**
 * mermaid.js の解析の結果 (FlowSnapshot) をエディタの取り込みの形 (ParsedMermaidData) にする (spec 11 D1)。
 * 対応は MCP の経路 (Rust の lorelei_core::editor::flowchart、data_contract の EditorPayload.mapping.flowchart) と同じ
 */
import { DropCounter, type DroppedItem } from "@/components/ui/mermaid-dropped";
import type { FlowEdgeSnapshot, FlowSnapshot } from "@/components/ui/mermaid-snapshot";
import type {
  ParsedMermaidData,
  ParsedMermaidEdge,
  ParsedMermaidNode,
  ParsedMermaidSubgraph,
} from "../hooks/mermaid";
import type { GraphType, MermaidArrowType, MermaidShapeType, SubgraphDirection } from "../types/types";
import { edgeIntoOwnFrame, orderParentsFirst } from "./subgraph-tree";

const SHAPES: Record<string, MermaidShapeType> = {
  square: "rectangle",
  round: "rounded",
  diamond: "diamond",
  circle: "circle",
  hexagon: "hexagon",
  stadium: "stadium",
  // `A@{ shape: … }` の書き方の名前 (spec 11 rev1。実測で確認)
  rect: "rectangle",
  rounded: "rounded",
  diam: "diamond",
  hex: "hexagon",
};

const EXACT_ARROWS: Record<string, MermaidArrowType> = {
  "arrow_point,normal": "arrow",
  "arrow_point,thick": "thick",
  "arrow_point,dotted": "dotted",
  "arrow_open,invisible": "invisible",
  "double_arrow_point,normal": "bidirectional",
  "double_arrow_point,thick": "bidirectional-thick",
};

/** 落とした矢印の名前 (merman は書かれた記号を持つので、それに合わせて記号にする) */
const arrowSymbol = (type: string, stroke: string): string => {
  const line = stroke === "thick" ? "==" : stroke === "dotted" ? "-.-" : "--";
  const head = type.endsWith("_circle") ? "o" : type.endsWith("_cross") ? "x" : type.endsWith("_point") ? ">" : "";
  if (type === "arrow_open") return stroke === "thick" ? "===" : stroke === "dotted" ? "-.-" : "---";
  if (type.startsWith("double_")) return `${head === ">" ? "<" : head}${line}${head}`;
  return head ? `${line}${head}` : type;
};

const arrowType = (edge: FlowEdgeSnapshot, drops: DropCounter): MermaidArrowType => {
  const exact = EXACT_ARROWS[`${edge.type},${edge.stroke}`];
  if (exact) return exact;
  drops.add(`edge:${arrowSymbol(edge.type, edge.stroke)}`);
  const double = edge.type.startsWith("double_");
  if (edge.stroke === "invisible") return "invisible";
  if (double) return edge.stroke === "thick" ? "bidirectional-thick" : "bidirectional";
  if (edge.stroke === "thick") return "thick";
  if (edge.stroke === "dotted") return "dotted";
  return "arrow";
};

/** 図の向き。TD と同じ意味の TB は持たない (無ければ TD, spec 07 D1) */
export const directionOf = (direction: string): GraphType | undefined => {
  const d = direction.toUpperCase();
  return d === "LR" || d === "RL" || d === "BT" ? d : undefined;
};

/**
 * 枠の中の向き (spec 16 D1)。TD は TB にそろえる (裁定 3)。小文字は mermaid.js も merman も文法の誤りなので来ない (P0)
 */
export const subgraphDirectionOf = (dir: string | undefined): SubgraphDirection | undefined => {
  if (dir === "TD" || dir === "TB") return "TB";
  return dir === "BT" || dir === "LR" || dir === "RL" ? dir : undefined;
};

export function flowFromMermaid(snapshot: FlowSnapshot): { data: ParsedMermaidData; dropped: DroppedItem[] } {
  const drops = new DropCounter();
  drops.add("accessibility", snapshot.accessibility);
  drops.add("classDef", snapshot.classDefs);
  drops.add("tooltip", snapshot.tooltips);

  // subgraph を線の行き先にすると、mermaid はその subgraph をノードにも入れる
  const subgraphIds = new Set(snapshot.subgraphs.map((s) => s.id));
  const nodes: ParsedMermaidNode[] = [];
  const ids = new Set<string>();
  for (const v of snapshot.vertices) {
    if (subgraphIds.has(v.id)) continue;
    // 括弧の無い裸のノード (`A --> B`) は type が無い = 四角
    const shape = v.type ?? "square";
    const shapeType = SHAPES[shape];
    if (!shapeType) drops.add(`shape:${shape}`);
    drops.add("class", v.classes.length > 0 ? 1 : 0);
    drops.add("style", v.styles.length > 0 ? 1 : 0);
    drops.add("click", v.clickable ? 1 : 0);
    ids.add(v.id);
    // 空白だけのラベルは空にする (生成器は空のラベルを [" "] と書く。B[] ・ B[""] は mermaid の誤り)
    const label = v.text.trim() === "" ? "" : v.text;
    nodes.push({ id: v.id, variableName: v.id, label, shapeType: shapeType ?? "rectangle" });
  }

  const subgraphs = subgraphsOf(snapshot, nodes.map((n) => n.id));
  const frameIds = new Set(subgraphs.map((s) => s.id));
  const parentOf = new Map<string, string>();
  subgraphs.forEach((s) => {
    if (s.parent !== undefined) parentOf.set(s.id, s.parent);
    s.nodes.forEach((n) => parentOf.set(n, s.id));
  });

  const edges: ParsedMermaidEdge[] = [];
  // ID は {source}-{target}。ID に - を含むノードがあるとぶつかりうるので、使った ID を持ち、空くまで番号を足す (rev1、査読 8)
  const used = new Set<string>();
  const uniqueId = (base: string): string => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  for (const e of snapshot.edges) {
    // 線の端はノードか枠 (枠を指す線は枠につなぐ, spec 16 D2)。mermaid は線の端を必ずノードか枠にする
    const known = (id: string) => ids.has(id) || frameIds.has(id);
    if (!known(e.start) || !known(e.end)) continue;
    // 枠と自分の中を結ぶ線は描画されない (P0) ので落とす (裁定 2)
    if (edgeIntoOwnFrame(e.start, e.end, (id) => frameIds.has(id), (id) => parentOf.get(id))) {
      drops.add("edge_into_own_subgraph");
      continue;
    }
    const type = arrowType(e, drops);
    drops.add("class", e.classes.length > 0 ? 1 : 0);
    drops.add("style", e.styles.length > 0 ? 1 : 0);
    drops.add("edge_length", e.length > 1 ? 1 : 0);
    edges.push({
      id: uniqueId(`${e.start}-${e.end}`),
      source: e.start,
      target: e.end,
      label: e.text,
      arrowType: type,
    });
  }

  const direction = directionOf(snapshot.direction);
  const data: ParsedMermaidData = { nodes, edges };
  if (direction) data.direction = direction;
  if (subgraphs.length > 0) data.subgraphs = subgraphs;
  return { data, dropped: drops.toList() };
}

/**
 * 枠 (spec 15 D1)。mermaid.js の一覧の nodes には子の枠の ID も入るので、それを子の枠の親にする。
 * 自分自身を nodes に持つ枠 (`subgraph X` の中の `X`) はその 1 件を無視する。1 つのノードは 1 つの枠にだけ入れる
 * (mermaid.js も merman も先に閉じた枠だけが持つ。念のため先に出た枠を採る)。枠の中のノードは図のノードの順に並べる
 * (mermaid.js は線の書き順の逆で返すことがある)
 */
function subgraphsOf(snapshot: FlowSnapshot, nodeOrder: string[]): ParsedMermaidSubgraph[] {
  const rank = new Map(nodeOrder.map((id, i) => [id, i]));
  const subgraphIds = new Set(snapshot.subgraphs.map((s) => s.id));
  const parentOf = new Map<string, string>();
  const claimed = new Set<string>();
  const direct = new Map<string, string[]>();
  for (const s of snapshot.subgraphs) {
    const members: string[] = [];
    for (const m of s.nodes) {
      if (m === s.id) continue;
      if (subgraphIds.has(m)) {
        if (!parentOf.has(m)) parentOf.set(m, s.id);
      } else if (rank.has(m) && !claimed.has(m)) {
        claimed.add(m);
        members.push(m);
      }
    }
    direct.set(
      s.id,
      members.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    );
  }
  return orderParentsFirst(
    snapshot.subgraphs.map((s): ParsedMermaidSubgraph => {
      const parent = parentOf.get(s.id);
      // 空白だけの題は空にする (生成器は空の題を [" "] と書く。[""] は mermaid.js の誤り, spec 15 P0)
      const title = s.title.trim() === "" ? "" : s.title;
      const sub: ParsedMermaidSubgraph = { id: s.id, title, nodes: direct.get(s.id) ?? [] };
      if (parent !== undefined) sub.parent = parent;
      const direction = subgraphDirectionOf(s.dir);
      if (direction) sub.direction = direction;
      return sub;
    })
  );
}
