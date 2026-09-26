import type { Node, Edge } from "@xyflow/react";
import type { ERTableNodeProps } from "@/features/er-diagram/components/node/er-table-node";
import { ER_CARDINALITY_SYMBOLS } from "../types";

/**
 * ER図ノード・エッジ配列からmermaid ER記法を生成
 */
export function generateERDiagramMermaidCode(
  nodes: Node<ERTableNodeProps>[],
  edges: Edge[]
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
      const label = edge.data?.label || "relation";
      const cardinality = edge.data?.cardinality || "one-to-many";
      const symbol =
        ER_CARDINALITY_SYMBOLS[cardinality as keyof typeof ER_CARDINALITY_SYMBOLS] || "||--o{";
      return `  ${sourceNode.data.name} ${symbol} ${targetNode.data.name} : ${label}`;
    });

  return ["erDiagram", ...nodeDefs, ...edgeDefs.filter(Boolean)].join("\n");
}
