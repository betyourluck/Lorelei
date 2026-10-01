"use client";

import { createContext, useContext } from "react";
import type { GraphType } from "../types/types";

/** エディタの図の向き。ノードが接続点の位置を決めるのに使う (フローチャートと ER 図で共通) */
export const DirectionContext = createContext<GraphType>("TD");

export const useDirection = (): GraphType => useContext(DirectionContext);

/**
 * フローチャートの枠の向き (spec 16 D4・D6)。handles はノード・枠の ID → 接続点の向き (置かれている入れ物の向き)、
 * notices は枠の ID → 見出しの知らせ (描画で効く向きがエディタの向きと違う時だけ)
 */
export interface FrameDirections {
  handles: ReadonlyMap<string, GraphType>;
  notices: ReadonlyMap<string, string>;
}

export const FrameDirectionsContext = createContext<FrameDirections | null>(null);

/** 接続点の向き。枠の中なら枠の向き、無ければ (ER 図・枠の外) 図の向き */
export const useHandleDirection = (id: string): GraphType => {
  const direction = useDirection();
  return useContext(FrameDirectionsContext)?.handles.get(id) ?? direction;
};

/** 枠の見出しの知らせ (無ければ undefined) */
export const useFrameNotice = (id: string): string | undefined =>
  useContext(FrameDirectionsContext)?.notices.get(id);
