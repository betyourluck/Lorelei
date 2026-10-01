/**
 * エディタで表現できず、取り込むと消える要素 (spec 11 D4)。
 * 数え方は MCP の経路 (Rust の lorelei_core::editor) と同じ名前を使い、MCP で届いた図の通知 (lib/desktop/open-requests.ts) と
 * インポートの警告で同じ言葉を出す
 */

/** 消える要素とその数。construct は "subgraph" や "shape:cylinder" / "edge:--o" のような名前 */
export interface DroppedItem {
  construct: string;
  count: number;
}

const LABELS: Record<string, string> = {
  subgraph: "サブグラフ",
  edge_to_subgraph: "サブグラフへの矢印",
  edge_into_own_subgraph: "枠とその中を結ぶ線",
  subgraph_direction: "サブグラフの中の向き",
  classDef: "classDef",
  class: "class 指定",
  style: "style 指定",
  click: "click",
  tooltip: "ツールチップ",
  edge_length: "矢印の長さ指定",
  accessibility: "アクセシビリティ情報",
  alias: "別名",
  attribute_comment: "属性のコメント",
  non_identifying: "非識別関係 (点線)",
  cardinality_unsupported: "未対応のカーディナリティ",
};

/** 消える要素を、人が読める 1 行にする。例: "サブグラフ ×2、style 指定 ×1" */
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

/** 数を足し集める箱。名前の順 (Rust の BTreeMap と同じ) で並べて返す */
export class DropCounter {
  private readonly counts = new Map<string, number>();

  add(construct: string, n = 1): void {
    if (n > 0) this.counts.set(construct, (this.counts.get(construct) ?? 0) + n);
  }

  toList(): DroppedItem[] {
    return Array.from(this.counts.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([construct, count]) => ({ construct, count }));
  }
}
