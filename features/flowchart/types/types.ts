import type { ParseKeys } from "i18next";
import { i18n } from "@/components/i18n";

export type MermaidArrowType =
  | "arrow" // -->
  | "thick" // ==>
  | "dotted" // -.->
  | "invisible" // ~~~
  | "bidirectional" // <-->
  | "bidirectional-thick"; // <==>

export type MermaidShapeType =
  | "rectangle" // [label]
  | "diamond" // {label}
  | "rounded" // (label)
  | "circle" // ((label))
  | "hexagon" // {{label}}
  | "stadium"; // ([label])

export type GraphType = "TD" | "LR" | "RL" | "BT";

/**
 * 枠 (サブグラフ) の中の向き (spec 16 D1)。書いていない時は持たない (図の向きの GraphType とは別: 枠では「書いていない」と「TB と書いた」が
 * Mermaid の描画で違う)。TD は TB と同じ意味なので TB にそろえる (裁定 3)
 */
export type SubgraphDirection = "TB" | "BT" | "LR" | "RL";

// UI定数
export const UI_CONSTANTS = {
  DOUBLE_CLICK_THRESHOLD: 300,
  DEBOUNCE_DELAY: 150,
  IME_COMPOSITION_DELAY: 100,
} as const;

// 矢印タイプの配列（セレクターなどで使用）
export const ARROW_TYPES: readonly MermaidArrowType[] = [
  "arrow",
  "thick",
  "dotted",
  "invisible",
  "bidirectional",
  "bidirectional-thick",
] as const;

// 形状オプション（セレクターで使用）。名は画面の言語で、描く時に訳す (spec 31 D6)
export const SHAPE_OPTIONS = [
  { type: "rectangle", labelKey: "shape.rectangle", symbol: "[ ]" },
  { type: "diamond", labelKey: "shape.diamond", symbol: "{ }" },
  { type: "rounded", labelKey: "shape.rounded", symbol: "( )" },
  { type: "circle", labelKey: "shape.circle", symbol: "(( ))" },
  { type: "hexagon", labelKey: "shape.hexagon", symbol: "{{ }}" },
  { type: "stadium", labelKey: "shape.stadium", symbol: "([ ])" },
] as const satisfies readonly { type: string; labelKey: ParseKeys; symbol: string }[];

/** 形の名 (今の画面の言語)。知らない形はその名のまま */
export const shapeLabel = (shape: string): string => {
  const option = SHAPE_OPTIONS.find((s) => s.type === shape);
  return option ? i18n.t(option.labelKey) : shape;
};
