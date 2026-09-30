/**
 * mermaid.js の解析の結果の写し (spec 11 D1)。境界 mermaid-render.ts の readMermaidDiagram が mermaid の内部の db から作る。
 * mermaid の内部の形はここで閉じ、取り込みの変換 (features/*\/utils/from-mermaid.ts) はこの素のデータだけを読む。
 * 文字は mermaid の内部の符号と HTML の実体参照を戻した後のもの
 */

export interface FlowVertexSnapshot {
  id: string;
  text: string;
  /** square / round / diamond / circle / stadium / hexagon / cylinder / … 括弧の無いノードは undefined */
  type?: string;
  classes: string[];
  styles: string[];
  /** click で付いたリンク・関数 */
  clickable: boolean;
}

export interface FlowEdgeSnapshot {
  start: string;
  end: string;
  /** arrow_point / arrow_open / arrow_circle / arrow_cross / double_arrow_point / … */
  type: string;
  /** normal / thick / dotted / invisible */
  stroke: string;
  text: string;
  length: number;
  classes: string[];
  styles: string[];
}

export interface FlowSnapshot {
  kind: "flowchart";
  direction: string;
  vertices: FlowVertexSnapshot[];
  edges: FlowEdgeSnapshot[];
  /** nodes には子の枠の ID も入る (spec 15 P0)。dir は枠の中の direction (無ければ持たない) */
  subgraphs: { id: string; title: string; nodes: string[]; dir?: string }[];
  classDefs: number;
  tooltips: number;
  /** accTitle / accDescr の数 */
  accessibility: number;
}

export interface ErAttributeSnapshot {
  type: string;
  name: string;
  keys: string[];
  comment: string;
}

export interface ErEntitySnapshot {
  /** 識別子 (図の中のテーブル名) */
  name: string;
  alias: string;
  attributes: ErAttributeSnapshot[];
  classes: string[];
  styles: string[];
}

export interface ErRelationshipSnapshot {
  /** 左側のテーブル名 */
  from: string;
  /** 右側のテーブル名 */
  to: string;
  label: string;
  /** 右側の記号 (mermaid の cardA) */
  cardA: string;
  /** 左側の記号 (mermaid の cardB) */
  cardB: string;
  /** IDENTIFYING / NON_IDENTIFYING */
  relType: string;
}

export interface ErSnapshot {
  kind: "er";
  direction: string;
  /** 出てきた順 */
  entities: ErEntitySnapshot[];
  relationships: ErRelationshipSnapshot[];
  /**
   * subgraph (mermaid 11 の ER 図にもある)。関係が subgraph を指すと、from / to はその subgraph の id のままで、
   * 同じ名前のテーブルも現れる (spec 11 rev1、査読 2・実測)
   */
  subgraphs: { id: string; nodes: string[] }[];
  classDefs: number;
  accessibility: number;
}

/** エディタで開けない種類の図 */
export interface OtherSnapshot {
  kind: "other";
  /** mermaid の図の種類 (sequence など) */
  type: string;
}

export type MermaidSnapshot = FlowSnapshot | ErSnapshot | OtherSnapshot;
