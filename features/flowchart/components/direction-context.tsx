"use client";

import { createContext, useContext } from "react";
import type { GraphType } from "../types/types";

/** エディタの図の向き。ノードが接続点の位置を決めるのに使う (フローチャートと ER 図で共通) */
export const DirectionContext = createContext<GraphType>("TD");

export const useDirection = (): GraphType => useContext(DirectionContext);
