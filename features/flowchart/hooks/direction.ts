import { Position } from "@xyflow/react";
import type { GraphType } from "../types/types";

/**
 * 図の向きの扱い (フローチャートと ER 図で共通)。
 * Mermaid の向きは TD (= TB) / LR / RL / BT。TB は TD と同じ意味なので TD にそろえる。
 */
export const DIRECTIONS: readonly GraphType[] = ["TD", "LR", "RL", "BT"];

/** 読んだ向きをエディタの向きにする。TB は TD、知らない値と無い時は TD */
export const normalizeDirection = (raw: string | undefined | null): GraphType => {
  const d = raw?.trim().toUpperCase();
  if (d === "LR" || d === "RL" || d === "BT") return d;
  return "TD";
};

/** 段が横に進むか (LR / RL) */
const isHorizontal = (direction: GraphType): boolean => direction === "LR" || direction === "RL";
/** 段の順を反対にするか (BT / RL) */
const isReversed = (direction: GraphType): boolean => direction === "BT" || direction === "RL";

export interface LayoutSlot {
  /** 段 (0 から) */
  level: number;
  /** 同じ段の中の順 */
  index: number;
  /** 同じ段の数 */
  count: number;
  /** いちばん深い段 */
  maxLevel: number;
}

export interface LayoutGaps {
  /** 段と段の間 */
  levelGap: number;
  /** 同じ段の中の間 */
  spacing: number;
  /** 段の始まりの位置 */
  start: number;
  /** 同じ段の並びの中心 */
  center?: number;
}

/**
 * 取り込み時の階層配置で、ノードの位置を向きに合わせて決める。
 * 軸 = LR / RL なら段を横 (x) に、TD / BT なら縦 (y) に進める。逆向き = BT / RL なら段の順を反対にする。
 */
export const placeByDirection = (
  { level, index, count, maxLevel }: LayoutSlot,
  direction: GraphType,
  { levelGap, spacing, start, center = 0 }: LayoutGaps
): { x: number; y: number } => {
  const step = isReversed(direction) ? maxLevel - level : level;
  const along = step * levelGap + start;
  const across = -(count * spacing) / 2 + index * spacing + center;
  return isHorizontal(direction) ? { x: along, y: across } : { x: across, y: along };
};

/** ノードの入口 (target) と出口 (source) を向きに合わせる */
export const handlePositions = (direction: GraphType): { target: Position; source: Position } => {
  switch (direction) {
    case "LR":
      return { target: Position.Left, source: Position.Right };
    case "RL":
      return { target: Position.Right, source: Position.Left };
    case "BT":
      return { target: Position.Bottom, source: Position.Top };
    default:
      return { target: Position.Top, source: Position.Bottom };
  }
};
