// MCP の open_in_editor → GUI へ届く「開く図」(src-tauri の OpenRequest, spec 01 D5' / D8)。
// 振り分けと表示用の文言は純粋関数に分け、vitest で固定する。

import type { DocumentSummary } from "./documents";

export type EditorKind = "flowchart" | "erDiagram";

export interface DroppedItem {
  construct: string;
  count: number;
}

export interface OpenRequest {
  source: string;
  payload: { editor: EditorKind; data: unknown; dropped: DroppedItem[] } | null;
  dropped: DroppedItem[];
  error: string | null;
  /** AI / インポートで届いた図のために Rust が作った新しい 1 件 (spec 02 D8・D10)、update_diagram では書き換え後のその 1 件。保存した図を開く時は null */
  document?: DocumentSummary | null;
  /** update_diagram が開いている図を載せ替える要求 (spec 08 D3)。drain は partitionOpens に入れず別に扱う */
  reload?: boolean;
  /** update_diagram の要求に付く、その図の位置 (同じ ID のノードの位置を当てる)。保存した図を開く時は null */
  layout?: Record<string, { x: number; y: number }> | null;
}

/** エディタの種類 → ページ。next.config の trailingSlash: true に合わせる */
export const routeOf = (editor: EditorKind): string =>
  editor === "flowchart" ? "/" : "/er-diagram/";

export interface Partitioned {
  /** このページのエディタで開くもの。取り込み処理はキャンバスを置き換えるので最後の 1 件が残る */
  mine: OpenRequest[];
  /** 別のページのエディタで開くもの */
  others: OpenRequest[];
  /** 変換に失敗したもの (error に理由) */
  failed: OpenRequest[];
}

export const partitionOpens = (requests: OpenRequest[], editor: EditorKind): Partitioned => {
  const result: Partitioned = { mine: [], others: [], failed: [] };
  for (const r of requests) {
    if (!r.payload) result.failed.push(r);
    else if (r.payload.editor === editor) result.mine.push(r);
    else result.others.push(r);
  }
  return result;
};

const LABELS: Record<string, string> = {
  subgraph: "サブグラフ",
  edge_to_subgraph: "サブグラフへの矢印",
  classDef: "classDef",
  class: "class 指定",
  style: "style 指定",
  click: "click",
  tooltip: "ツールチップ",
  edge_length: "矢印の長さ指定",
  accessibility: "アクセシビリティ情報",
  alias: "別名",
  attribute_comment: "属性のコメント",
  fk: "FK",
  non_identifying: "非識別関係 (点線)",
  cardinality_unsupported: "未対応のカーディナリティ",
};

/** エディタで表現できず失われた要素を、人が読める 1 行にする。例: "サブグラフ ×2、style 指定 ×1" */
export const describeDropped = (dropped: DroppedItem[]): string =>
  dropped
    .map(({ construct, count }) => {
      const [kind, detail] = construct.split(":");
      const label =
        kind === "shape"
          ? `形 ${detail}`
          : kind === "edge"
            ? `矢印 ${detail}`
            : kind === "direction"
              ? `向き ${detail}`
              : (LABELS[kind] ?? construct);
      return `${label} ×${count}`;
    })
    .join("、");
