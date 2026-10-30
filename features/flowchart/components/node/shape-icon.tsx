import type { MermaidShapeType } from "../../types/types";

/**
 * Mermaid の形の輪郭を縮めた絵 (spec 29 D4)。lucide の組では角丸と四角形・左右が尖る六角形を表せないので、6 つとも自前で描く。
 * 名は持たない (aria-hidden)。名はこれを置くボタン・項目の側に持たせる
 */
const OUTLINES: Record<MermaidShapeType, JSX.Element> = {
  rectangle: <rect x="1.5" y="4" width="13" height="8" />,
  rounded: <rect x="1.5" y="4" width="13" height="8" rx="2.5" />,
  stadium: <rect x="1.5" y="4" width="13" height="8" rx="4" />,
  circle: <circle cx="8" cy="8" r="6.25" />,
  diamond: <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" />,
  hexagon: <polygon points="1.5,8 4.75,3.5 11.25,3.5 14.5,8 11.25,12.5 4.75,12.5" />,
};

export const ShapeIcon = ({ shape, size = 16 }: { shape: MermaidShapeType; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    data-shape={shape}
  >
    {OUTLINES[shape] ?? OUTLINES.rectangle}
  </svg>
);
