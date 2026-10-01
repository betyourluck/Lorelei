import type { Node, Edge } from "@xyflow/react";
import type { MermaidArrowType } from "../types/types";

/**
 * FlowEditorのビジネスロジックを分離したヘルパー関数
 * これらの関数は純粋関数なので、簡単にテストできます
 */

export interface FlowData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * ノードの位置を計算する
 */
export function calculateNodePosition(
  mousePosition: { x: number; y: number },
  nodeWidth: number,
  nodeHeight: number
): { x: number; y: number } {
  return {
    x: mousePosition.x - nodeWidth / 2,
    y: mousePosition.y - nodeHeight / 2,
  };
}

/**
 * 新しいノードを作成する
 */
export function createNewNode(
  nodeId: number,
  position: { x: number; y: number },
  handlers: {
    onLabelChange: (nodeId: string, newLabel: string) => void;
    onVariableNameChange: (nodeId: string, newVariableName: string) => void;
    onShapeTypeChange: (nodeId: string, newShapeType: string) => void;
    onDelete: (nodeId: string) => void;
  }
): Node {
  return {
    id: nodeId.toString(),
    type: "editableNode",
    position,
    data: {
      label: `Node ${nodeId}`,
      variableName: `node${nodeId}`,
      shapeType: "rectangle",
      ...handlers,
    },
  };
}

/**
 * 新しいエッジを作成する
 */
export function createNewEdge(
  sourceNodeId: string,
  targetNodeId: string,
  handleType: string | undefined,
  handlers: {
    onLabelChange: (edgeId: string, newLabel: string) => void;
    onArrowTypeChange: (edgeId: string, arrowType: MermaidArrowType) => void;
    onDelete: (edgeId: string) => void;
  }
): Edge {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    type: "editableEdge",
    source: handleType === "source" ? sourceNodeId : targetNodeId,
    target: handleType === "source" ? targetNodeId : sourceNodeId,
    data: {
      label: "",
      arrowType: "arrow" as MermaidArrowType,
      ...handlers,
    },
  };
}

/**
 * 接続情報を解析する。`{ノードの ID}-{source | target}` の最後の - で分ける
 * (ノードの ID にも - が入る: 取り込んだ a-b、枠の frame-group1-<時刻>。以前は最初の - で分けて ID が壊れていた)
 */
export function parseConnectingNodeId(connectingNodeId: string): {
  sourceNodeId: string;
  handleType: string | undefined;
} {
  const cut = connectingNodeId.lastIndexOf("-");
  if (cut < 0) return { sourceNodeId: connectingNodeId, handleType: undefined };
  return {
    sourceNodeId: connectingNodeId.slice(0, cut),
    handleType: connectingNodeId.slice(cut + 1),
  };
}
