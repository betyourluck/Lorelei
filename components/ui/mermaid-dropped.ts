/**
 * エディタで表現できず、取り込むと消える要素 (spec 11 D4)。
 * 数え方は MCP の経路 (Rust の lorelei_core::editor) と同じ名前を使い、MCP で届いた図の通知 (lib/desktop/open-requests.ts) と
 * インポートの警告で同じ言葉を出す。言葉は画面の言語で、呼ばれた時に訳す (spec 31 D6)
 */
import type { ParseKeys } from "i18next";
import { i18n } from "@/components/i18n";

/** 消える要素とその数。construct は "subgraph" や "shape:cylinder" / "edge:--o" のような名前 */
export interface DroppedItem {
  construct: string;
  count: number;
}

const LABELS: Record<string, ParseKeys> = {
  subgraph: "dropped.subgraph",
  edge_to_subgraph: "dropped.edgeToSubgraph",
  edge_into_own_subgraph: "dropped.edgeIntoOwnSubgraph",
  classDef: "dropped.classDef",
  class: "dropped.class",
  style: "dropped.style",
  click: "dropped.click",
  tooltip: "dropped.tooltip",
  edge_length: "dropped.edgeLength",
  accessibility: "dropped.accessibility",
  alias: "dropped.alias",
  attribute_comment: "dropped.attributeComment",
  non_identifying: "dropped.nonIdentifying",
  cardinality_unsupported: "dropped.cardinalityUnsupported",
};

/** 種類の後ろに詳しい名が付くもの (shape:cylinder など) */
const WITH_DETAIL: Record<string, ParseKeys> = {
  shape: "dropped.shape",
  edge: "dropped.edge",
  direction: "dropped.direction",
  config: "dropped.config",
  theme: "dropped.theme",
};

/** 消える要素を、人が読める 1 行にする。例: "サブグラフ ×2、style 指定 ×1" */
export const describeDropped = (dropped: DroppedItem[]): string =>
  dropped
    .map(({ construct, count }) => {
      const [kind, detail] = construct.split(":");
      const label = WITH_DETAIL[kind]
        ? i18n.t(WITH_DETAIL[kind], { detail })
        : LABELS[kind]
          ? i18n.t(LABELS[kind])
          : construct;
      return i18n.t("dropped.item", { label, count });
    })
    .join(i18n.t("dropped.separator"));

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
