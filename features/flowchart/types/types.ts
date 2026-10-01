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

// 形状オプション（セレクターで使用）
export const SHAPE_OPTIONS = [
  { type: "rectangle", label: "四角形", symbol: "[ ]" },
  { type: "diamond", label: "菱形", symbol: "{ }" },
  { type: "rounded", label: "角丸四角", symbol: "( )" },
  { type: "circle", label: "円形", symbol: "(( ))" },
  { type: "hexagon", label: "六角形", symbol: "{{ }}" },
  { type: "stadium", label: "スタジアム", symbol: "([ ])" },
] as const;
