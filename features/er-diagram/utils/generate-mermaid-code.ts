import type { Node, Edge } from "@xyflow/react";
import type { ERTableNodeProps } from "@/features/er-diagram/components/node/er-table-node";
import type { GraphType } from "@/features/flowchart/types/types";
import { ER_CARDINALITY_SYMBOLS } from "../types";
import { columnIssue, quoteErName } from "./er-names";

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
      `  ${quoteErName(node.data.name)} {`,
      // 書きかけ・書けない形の列は書かない (図全体を文法の誤りにしない。spec 13 D2)
      ...node.data.columns.filter((col) => columnIssue(col) === null).map((col) => {
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
      return `  ${quoteErName(sourceNode.data.name)} ${symbol} ${quoteErName(targetNode.data.name)} : ${quoteErName(label)}`;
    });

  const header = direction === "TD" ? ["erDiagram"] : ["erDiagram", `  direction ${direction}`];
  return [...header, ...nodeDefs, ...edgeDefs.filter(Boolean)].join("\n");
}
