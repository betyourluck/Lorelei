import { useColorMode } from "@yamada-ui/react";
import type { CSSProperties } from "react";

// キャンバス (xyflow) の色 (spec 27 D5)。2 つのエディタの <ReactFlow> に広げて渡す。
// 地・ミニマップ・Controls は xyflow の light / dark に任せ、線の色だけ色の名 edgeStroke で読む
// (xyflow の dark の既定の線 #3e3e3e は地 #141414 に 1.72 で読めない。ライトは xyflow の既定と同じ値)

const CANVAS_STYLE = { "--xy-edge-stroke": "var(--ui-colors-edgeStroke)" } as CSSProperties;

/** yamada-ui の解決した色モード (OS に合わせる時は OS の色) を xyflow に渡す */
export function useCanvasColors(): { colorMode: "light" | "dark"; style: CSSProperties } {
  const { colorMode } = useColorMode();
  return { colorMode, style: CANVAS_STYLE };
}
