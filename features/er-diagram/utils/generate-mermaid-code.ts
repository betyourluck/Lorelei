import type { Node, Edge } from "@xyflow/react";
import type { ERTableNodeProps } from "@/features/er-diagram/components/node/er-table-node";
import type { GraphType } from "@/features/flowchart/types/types";
import { ER_CARDINALITY_SYMBOLS } from "../types";

/**
 * 関係のラベル。文字・数字・_・- だけならそのまま、それ以外 (空白・括弧・記号) は囲まないと mermaid の文法の誤りになるので囲む。
 * 囲んだ中の " は mermaid の実体参照 #quot; にし、#語; の # は #35; にする (spec 11 D5)
 */
const PLAIN_LABEL = new RegExp("^[\\p{L}\\p{N}_-]+$", "u");
const ENTITY_HASH = new RegExp("#(?=[\\p{L}\\p{N}_]+;)", "gu");
const quoteRelationLabel = (label: string): string =>
  PLAIN_LABEL.test(label) ? label : `"${label.replace(ENTITY_HASH, "#35;").replace(/"/g, "#quot;")}"`;

/**
 * ER図ノード・エッジ配列からmermaid ER記法を生成
 */
export function generateERDiagramMermaidCode(
  nodes: Node<ERTableNodeProps>[],
  edges: Edge[],
  /** 図の向き。TD (既定) の時は direction の行を書かない */
  direction: GraphType = "TD"
): string {
  // ノード部
  const nodeDefs = nodes.map((node) => {
    const lines = [
      `  ${node.data.name} {`,
      ...node.data.columns.map((col) => {
        // キーは PK → UK → FK の順でカンマ区切り (Mermaid の ER 図は複数のキーを書ける)。PK と UK は排他 (PK を優先)
        const keys = [col.pk ? "PK" : col.uk ? "UK" : null, col.fk ? "FK" : null].filter(Boolean);
        const attrs = [col.type, col.name];
        if (keys.length > 0) attrs.push(keys.join(", "));
        return `    ${attrs.join(" ")}`;
      }),
      `  }`,
    ];
    return lines.join("\n");
  });

  // エッジ部
  const edgeDefs = edges
    .filter((edge) => edge.type === "erEdge")
    .map((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return "";
      const label = String(edge.data?.label || "relation");
      const cardinality = edge.data?.cardinality || "one-to-many";
      const symbol =
        ER_CARDINALITY_SYMBOLS[cardinality as keyof typeof ER_CARDINALITY_SYMBOLS] || "||--o{";
      return `  ${sourceNode.data.name} ${symbol} ${targetNode.data.name} : ${quoteRelationLabel(label)}`;
    });

  const header = direction === "TD" ? ["erDiagram"] : ["erDiagram", `  direction ${direction}`];
  return [...header, ...nodeDefs, ...edgeDefs.filter(Boolean)].join("\n");
}
