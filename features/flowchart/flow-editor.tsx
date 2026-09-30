"use client";

import type { Node, Edge, Connection, OnConnectStartParams, OnConnectEnd } from "@xyflow/react";
import { ReactFlow, addEdge, useNodesState, useEdgesState, useReactFlow } from "@xyflow/react";
import { Box, useToken } from "@yamada-ui/react";
import { useCallback, useState, useRef, useEffect } from "react";
import { FlowLayout } from "@/components/layout/";
import { useConfirmDelete } from "@/components/ui/confirm-delete";
import { useDesktopOpen } from "@/lib/desktop";
import { DirectionContext } from "./components/direction-context";
import { edgeTypes } from "./components/edge/edge-types";
import { nodeTypes } from "./components/node/node-types";
import { FlowPanel } from "./components/panel/flow-panel";
import { normalizeDirection, placeByDirection } from "./hooks/direction";
import {
  calculateNodePosition,
  createNewNode,
  createNewEdge,
  parseConnectingNodeId,
} from "./hooks/flow-helpers";
import type { ParsedMermaidData } from "./hooks/mermaid";
import type { MermaidArrowType } from "./types";
import type { GraphType } from "./types/types";
import { layoutNested, type NestedLayoutMetrics } from "./utils/nested-layout";
import { SUBGRAPH_NODE_TYPE } from "./utils/subgraph-tree";

// レイアウト定数
const LAYOUT_CONSTANTS = {
  LEVEL_HEIGHT: 150, // レベル間の縦幅
  NODE_SPACING: 250, // 同レベル内のノード間隔（横方向）
  CENTER_OFFSET: 300, // 中央揃えのためのオフセット
  VERTICAL_OFFSET: 50, // 上部からの初期オフセット
  LEVEL_WIDTH: 450, // 横向き (LR / RL) のレベル間の横幅 (ノードは横に長いので縦より広く)
} as const;

/**
 * 枠のある図の配置の寸法 (spec 15 D3)。ノードの大きさは描く前なので見積もり (幅は w="xs" の 240、高さは最小の 48。P1 で画面で測った)。
 * 送りは上の今の段組みと同じ
 */
const nestedLayoutMetrics = (direction: GraphType): NestedLayoutMetrics => {
  const horizontal = direction === "LR" || direction === "RL";
  return {
    node: { width: 240, height: 48 },
    pitchAlong: horizontal ? LAYOUT_CONSTANTS.LEVEL_WIDTH : LAYOUT_CONSTANTS.LEVEL_HEIGHT,
    pitchAcross: horizontal ? LAYOUT_CONSTANTS.LEVEL_HEIGHT : LAYOUT_CONSTANTS.NODE_SPACING,
    start: LAYOUT_CONSTANTS.VERTICAL_OFFSET,
    center: LAYOUT_CONSTANTS.CENTER_OFFSET,
    padding: 24,
    titleHeight: 28,
  };
};

/** 新しいエディタの初期図 (デスクトップ版は Document.initial_sources として凍結している, spec 04 D4-2) */
export const initialFlowNodes: Node[] = [
  {
    id: "1",
    type: "editableNode",
    position: { x: 250, y: 5 },
    data: {
      label: "Start",
      // 表示名と変数名を持ちたい
      variableName: "startNode",
      // ノードの形状タイプ
      shapeType: "rectangle",
      // 削除機能は後でuseEffectで追加される
    },
  },
];

const initialEdges: Edge[] = [];

export function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeId, setNodeId] = useState(2);
  // 図の向き (spec 07 D1)。コード生成・パネル・接続点はこれを読み書きする
  const [direction, setDirection] = useState<GraphType>("TD");
  // DownloadModalの状態管理はFlowPanelに移動
  const connectingNodeId = useRef<string | null>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  // 削除はメニューも Backspace も deleteElements → onBeforeDelete の確認を通す (つながる線も一緒に消える)
  const confirmDelete = useConfirmDelete("node", (n) => String((n.data as { label?: unknown }).label ?? ""));

  // ノードサイズをトークンから取得（フォールバック値あり）
  const nodeWidthToken = useToken("sizes", "xs");
  const nodeHeightToken = useToken("sizes", "6xs");

  // 文字列から数値に変換（pxを取り除いて数値化）
  const parseSize = (sizeStr: string | undefined, fallback: number): number => {
    if (!sizeStr) return fallback;
    const numValue = parseFloat(sizeStr.replace("px", "").replace("rem", ""));
    return isNaN(numValue) ? fallback : sizeStr.includes("rem") ? numValue * 16 : numValue;
  };

  const nodeWidth = parseSize(nodeWidthToken, 80); // フォールバック: 80px
  const nodeHeight = parseSize(nodeHeightToken, 48); // フォールバック: 48px

  // ノードラベル変更のハンドラー
  const handleLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, label: newLabel } } : node
        )
      );
    },
    [setNodes]
  );

  // ノード変数名変更のハンドラー
  const handleVariableNameChange = useCallback(
    (nodeId: string, newVariableName: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, variableName: newVariableName } }
            : node
        )
      );
    },
    [setNodes]
  );

  // ノード形状変更のハンドラー
  const handleShapeTypeChange = useCallback(
    (nodeId: string, newShapeType: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, shapeType: newShapeType } } : node
        )
      );
    },
    [setNodes]
  );

  // ノード削除のハンドラー。確認は onBeforeDelete が出し、つながる線は xyflow が一緒に消す
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      void deleteElements({ nodes: [{ id: nodeId }] });
    },
    [deleteElements]
  );

  // エッジラベル変更のハンドラー
  const handleEdgeLabelChange = useCallback(
    (edgeId: string, newLabel: string) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId ? { ...edge, data: { ...edge.data, label: newLabel } } : edge
        )
      );
    },
    [setEdges]
  );

  // エッジ削除のハンドラー
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    },
    [setEdges]
  );

  // エッジ矢印タイプ変更のハンドラー
  const handleEdgeArrowTypeChange = useCallback(
    (edgeId: string, arrowType: MermaidArrowType) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId ? { ...edge, data: { ...edge.data, arrowType } } : edge
        )
      );
    },
    [setEdges]
  );

  // 初期ノードにhandleLabelChangeとhandleNodeDeleteを追加
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onLabelChange: handleLabelChange,
          onVariableNameChange: handleVariableNameChange,
          onShapeTypeChange: handleShapeTypeChange,
          onDelete: handleNodeDelete,
        },
      }))
    );
  }, [
    handleLabelChange,
    handleVariableNameChange,
    handleShapeTypeChange,
    handleNodeDelete,
    setNodes,
  ]);

  // エッジにハンドラーを追加
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        type: "editableEdge",
        data: {
          ...edge.data,
          onLabelChange: handleEdgeLabelChange,
          onArrowTypeChange: handleEdgeArrowTypeChange,
          onDelete: handleEdgeDelete,
        },
      }))
    );
  }, [handleEdgeLabelChange, handleEdgeArrowTypeChange, handleEdgeDelete, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: "editableEdge",
        data: {
          label: "",
          arrowType: "arrow" as MermaidArrowType,
          onLabelChange: handleEdgeLabelChange,
          onArrowTypeChange: handleEdgeArrowTypeChange,
          onDelete: handleEdgeDelete,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      // 既存のノードに接続された場合、フラグを設定
      connectingNodeId.current = "connected";
    },
    [setEdges, handleEdgeLabelChange, handleEdgeArrowTypeChange, handleEdgeDelete]
  );

  const onConnectStart = useCallback(
    (_: MouseEvent | TouchEvent | null, params: OnConnectStartParams) => {
      connectingNodeId.current = params.nodeId;
      // ハンドルタイプも保存
      connectingNodeId.current = `${params.nodeId}-${params.handleType}`;
    },
    []
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeId.current) return;

      // 既存のノードに接続された場合は新しいノードを作成しない
      if (connectingNodeId.current === "connected") {
        connectingNodeId.current = null;
        return;
      }

      const targetIsPane = (event?.target as Element)?.classList?.contains("react-flow__pane");

      // スマホでタッチイベントの場合、targetが期待される要素でない可能性があるため、
      // react-flow__pane またはその子要素の場合に新しいノードを作成
      const shouldCreateNode =
        targetIsPane ||
        (event && event.target instanceof Element && event.target.closest(".react-flow__pane"));

      if (shouldCreateNode && event) {
        // 接続情報を解析
        const { sourceNodeId, handleType } = parseConnectingNodeId(connectingNodeId.current);

        // 元のノードの位置を取得
        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        if (!sourceNode) return;

        // マウス位置またはタッチ位置を取得
        let clientX: number, clientY: number;

        if (event instanceof TouchEvent && event.changedTouches.length > 0) {
          // タッチエンドイベントの場合
          clientX = event.changedTouches[0].clientX;
          clientY = event.changedTouches[0].clientY;
        } else {
          // マウスイベントの場合
          const mouseEvent = event as MouseEvent;
          clientX = mouseEvent.clientX;
          clientY = mouseEvent.clientY;
        }

        const mousePosition = screenToFlowPosition({
          x: clientX,
          y: clientY,
        });

        // 新しいノードの位置はマウス位置を使用
        const newPosition = calculateNodePosition(mousePosition, nodeWidth, nodeHeight);

        const newNode = createNewNode(nodeId, newPosition, {
          onLabelChange: handleLabelChange,
          onVariableNameChange: handleVariableNameChange,
          onShapeTypeChange: handleShapeTypeChange,
          onDelete: handleNodeDelete,
        });

        setNodes((nds) => nds.concat(newNode));

        // 新しいノードへのエッジを作成（方向を考慮）
        const newEdge = createNewEdge(sourceNodeId, nodeId.toString(), handleType, {
          onLabelChange: handleEdgeLabelChange,
          onArrowTypeChange: handleEdgeArrowTypeChange,
          onDelete: handleEdgeDelete,
        });
        setEdges((eds) => [...eds, newEdge]);

        setNodeId(nodeId + 1);
      }

      connectingNodeId.current = null;
    },
    [
      nodeId,
      setNodes,
      setEdges,
      screenToFlowPosition,
      handleLabelChange,
      handleVariableNameChange,
      handleShapeTypeChange,
      handleNodeDelete,
      handleEdgeLabelChange,
      handleEdgeArrowTypeChange,
      handleEdgeDelete,
      nodes,
      nodeWidth,
      nodeHeight,
    ]
  );

  const addNode = useCallback(() => {
    const newNode = createNewNode(
      nodeId,
      { x: Math.random() * 500, y: Math.random() * 500 },
      {
        onLabelChange: handleLabelChange,
        onVariableNameChange: handleVariableNameChange,
        onShapeTypeChange: handleShapeTypeChange,
        onDelete: handleNodeDelete,
      }
    );
    setNodes((nds) => nds.concat(newNode));
    setNodeId(nodeId + 1);
  }, [
    nodeId,
    setNodes,
    handleLabelChange,
    handleVariableNameChange,
    handleShapeTypeChange,
    handleNodeDelete,
  ]);

  const handleImportMermaid = useCallback(
    (data: ParsedMermaidData) => {
      // 取り込んだ図の向き (無ければ TD)。配置もこの向きに合わせる
      const importedDirection = normalizeDirection(data.direction);
      setDirection(importedDirection);
      // ノードの階層構造を分析してレイアウトを決定
      const layoutNodes = (
        nodes: ParsedMermaidData["nodes"],
        edges: ParsedMermaidData["edges"]
      ) => {
        // ルートノード（入力エッジがないノード）を見つける
        const hasIncomingEdge = new Set(edges.map((edge) => edge.target));
        const rootNodes = nodes.filter((node) => !hasIncomingEdge.has(node.id));

        // 各ノードのレベル（階層）を計算
        const levels = new Map<string, number>();
        const visited = new Set<string>();

        const calculateLevel = (nodeId: string, level: number = 0): void => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);

          const currentLevel = levels.get(nodeId) ?? 0;
          levels.set(nodeId, Math.max(currentLevel, level));

          // 子ノードのレベルを計算
          const outgoingEdges = edges.filter((edge) => edge.source === nodeId);
          outgoingEdges.forEach((edge) => {
            calculateLevel(edge.target, level + 1);
          });
        };

        // ルートノードから階層を計算
        rootNodes.forEach((node) => calculateLevel(node.id, 0));

        // 残りのノードも処理（循環参照などがある場合）
        nodes.forEach((node) => {
          if (!levels.has(node.id)) {
            levels.set(node.id, 0);
          }
        });

        // レベルごとにノードをグループ化
        const nodesByLevel = new Map<number, string[]>();
        levels.forEach((level, nodeId) => {
          if (!nodesByLevel.has(level)) {
            nodesByLevel.set(level, []);
          }
          nodesByLevel.get(level)!.push(nodeId);
        });

        // 位置を計算。段は向きに沿って (TD なら上から下、LR なら左から右)、同じ段は中央揃えで並べる
        const positions = new Map<string, { x: number; y: number }>();
        const maxLevel = Math.max(0, ...Array.from(nodesByLevel.keys()));
        const horizontal = importedDirection === "LR" || importedDirection === "RL";

        nodesByLevel.forEach((nodeIds, level) => {
          nodeIds.forEach((nodeId, index) => {
            positions.set(
              nodeId,
              placeByDirection(
                { level, index, count: nodeIds.length, maxLevel },
                importedDirection,
                horizontal
                  ? {
                      levelGap: LAYOUT_CONSTANTS.LEVEL_WIDTH,
                      spacing: LAYOUT_CONSTANTS.LEVEL_HEIGHT,
                      start: LAYOUT_CONSTANTS.VERTICAL_OFFSET,
                      center: LAYOUT_CONSTANTS.CENTER_OFFSET,
                    }
                  : {
                      levelGap: LAYOUT_CONSTANTS.LEVEL_HEIGHT,
                      spacing: LAYOUT_CONSTANTS.NODE_SPACING,
                      start: LAYOUT_CONSTANTS.VERTICAL_OFFSET,
                      center: LAYOUT_CONSTANTS.CENTER_OFFSET,
                    }
              )
            );
          });
        });

        return positions;
      };

      // 枠 (サブグラフ) がある図は入れ子の段組みで並べる (spec 15 D3)。無い図は今までどおり
      const frames = data.subgraphs ?? [];
      const nested =
        frames.length > 0 ? layoutNested(data, importedDirection, nestedLayoutMetrics(importedDirection)) : null;
      const positions = nested ? nested.positions : layoutNodes(data.nodes, data.edges);
      const parentOfNode = new Map(frames.flatMap((f) => f.nodes.map((n) => [n, f.id] as const)));

      // 枠は xyflow の親。親は子より前に並べる (frames は親から順, spec 15 D1)。
      // 枠を消すと xyflow は中身も消すので、中身を残す消し方 (裁定 3) ができるまで消せなくしておく (P3)
      const frameNodes: Node[] = frames.map((f) => {
        const size = nested?.frameSizes.get(f.id);
        return {
          id: f.id,
          type: SUBGRAPH_NODE_TYPE,
          position: positions.get(f.id) || { x: 0, y: 0 },
          ...(f.parent !== undefined ? { parentId: f.parent } : {}),
          ...(size ? { width: size.width, height: size.height } : {}),
          deletable: false,
          data: { variableName: f.id, title: f.title },
        };
      });

      // ParsedMermaidNodeをReactFlowのNode型に変換
      const convertedNodes: Node[] = data.nodes.map((parsedNode) => ({
        id: parsedNode.id,
        type: "editableNode",
        position: positions.get(parsedNode.id) || { x: 250, y: 50 }, // フォールバック位置
        ...(parentOfNode.has(parsedNode.id) ? { parentId: parentOfNode.get(parsedNode.id) } : {}),
        data: {
          label: parsedNode.label,
          variableName: parsedNode.variableName,
          shapeType: parsedNode.shapeType,
          onLabelChange: handleLabelChange,
          onVariableNameChange: handleVariableNameChange,
          onShapeTypeChange: handleShapeTypeChange,
          onDelete: handleNodeDelete,
        },
      }));

      // ParsedMermaidEdgeをReactFlowのEdge型に変換
      const convertedEdges: Edge[] = data.edges.map((parsedEdge) => ({
        id: parsedEdge.id,
        source: parsedEdge.source,
        target: parsedEdge.target,
        type: "editableEdge",
        data: {
          label: parsedEdge.label,
          arrowType: parsedEdge.arrowType,
          onLabelChange: handleEdgeLabelChange,
          onArrowTypeChange: handleEdgeArrowTypeChange,
          onDelete: handleEdgeDelete,
        },
      }));

      setNodes([...frameNodes, ...convertedNodes]);
      setEdges(convertedEdges);

      // インポートされたノード数を次のnodeIdに設定
      setNodeId(data.nodes.length + 1);
    },
    [
      setNodes,
      setEdges,
      handleLabelChange,
      handleVariableNameChange,
      handleShapeTypeChange,
      handleNodeDelete,
      handleEdgeLabelChange,
      handleEdgeArrowTypeChange,
      handleEdgeDelete,
    ]
  );

  // Lorelei: MCP の open_in_editor で届いた図を既存の取り込み処理へ流す (デスクトップ版のみ)
  useDesktopOpen<ParsedMermaidData>("flowchart", handleImportMermaid);

  return (
    <Box h="var(--lorelei-editor-h, 100vh)" w="full">
      {/* ノードが接続点の位置を向きに合わせるのに使う */}
      <DirectionContext.Provider value={direction}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onBeforeDelete={confirmDelete.onBeforeDelete}
        fitView
      >
        <FlowLayout>
          <FlowPanel
            onAddNode={addNode}
            onImportMermaid={handleImportMermaid}
            nodes={nodes}
            edges={edges}
            direction={direction}
            onDirectionChange={setDirection}
          />
        </FlowLayout>
      </ReactFlow>
      </DirectionContext.Provider>
      {confirmDelete.dialog}
    </Box>
  );
}
