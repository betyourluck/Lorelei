"use client";

import type {
  Node,
  Edge,
  Connection,
  OnBeforeDelete,
  OnConnectStartParams,
  OnConnectEnd,
} from "@xyflow/react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
} from "@xyflow/react";
import { Box, useToken } from "@yamada-ui/react";
import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { FlowLayout } from "@/components/layout/";
import { useConfirmDelete } from "@/components/ui/confirm-delete";
import { useDesktopOpen } from "@/lib/desktop";
import {
  DirectionContext,
  FrameDirectionsContext,
  type FrameDirections,
} from "./components/direction-context";
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
import { EdgeRouteContext, useEdgeRouting } from "./hooks/use-edge-routes";
import type { MermaidArrowType } from "./types";
import type { GraphType, SubgraphDirection } from "./types/types";
import { frameDirectionNotice, frameInnerDirections, handleDirections } from "./utils/frame-direction";
import {
  applyDrop,
  edgesBrokenByDrop,
  intoOwnFrame,
  frameNameRejected,
  isFrame,
  FRAME_NODE_STYLE,
  NEW_FRAME_SIZE,
  nextFrameName,
  planFrameDelete,
  relayoutFrame,
} from "./utils/frame-edit";
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
  // メニューや枠の × で名指しして消している途中のノード (onBeforeDelete が読んで消す)
  const namedDeleteRef = useRef<string | null>(null);
  const { screenToFlowPosition, deleteElements, getNodes, getEdges, getViewport } = useReactFlow();
  const storeApi = useStoreApi();
  // 枠をまたぐ線の経路 (spec 17)。線は自分の経路を EdgeRouteContext から読む
  const edgeRoutes = useEdgeRouting();
  // 削除はメニューも Backspace も deleteElements → onBeforeDelete の確認を通す (つながる線も一緒に消える)
  const confirmDelete = useConfirmDelete("node", (n) => String((n.data as { label?: unknown }).label ?? ""));
  const { onBeforeDelete: confirmNodeDelete, ask: askDelete } = confirmDelete;

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

  // ノード変数名変更のハンドラー。枠の ID は、ほかのノード・枠とぶつかる名前と空を確定させない (spec 15 D5)
  const handleVariableNameChange = useCallback(
    (nodeId: string, newVariableName: string) => {
      setNodes((nds) => {
        const target = nds.find((node) => node.id === nodeId);
        if (isFrame(target) && frameNameRejected(nds, nodeId, newVariableName)) return nds;
        return nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, variableName: newVariableName } }
            : node
        );
      });
    },
    [setNodes]
  );

  // 枠の題の変更 (spec 15 D5)
  const handleFrameTitleChange = useCallback(
    (nodeId: string, title: string) => {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, title } } : node))
      );
    },
    [setNodes]
  );

  // 枠の中の向きの変更 (spec 16 D7)。undefined で「指定なし」(direction を持たない)。
  // その枠の中だけを新しい向き (指定なしなら置かれている側の向き) で並べ直す (P5、裁定 4。図全体の向きの変更は並べ直さない)
  const directionRef = useRef<GraphType>(direction);
  directionRef.current = direction;
  const handleFrameDirectionChange = useCallback(
    (nodeId: string, frameDirection: SubgraphDirection | undefined) => {
      setNodes((nds) => {
        const updated = nds.map((node) => {
          if (node.id !== nodeId) return node;
          const { direction: _old, ...rest } = node.data as Record<string, unknown>;
          return { ...node, data: frameDirection ? { ...rest, direction: frameDirection } : rest };
        });
        const inner = frameInnerDirections(updated, directionRef.current).get(nodeId) ?? directionRef.current;
        return relayoutFrame(updated, getEdges(), nodeId, inner, nestedLayoutMetrics);
      });
    },
    [setNodes, getEdges]
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
      // メニューや枠の × で名指しした削除。onBeforeDelete は子の選択を見ない (spec 15 D5)
      namedDeleteRef.current = nodeId;
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
          onTitleChange: handleFrameTitleChange,
          onDirectionChange: handleFrameDirectionChange,
        },
      }))
    );
  }, [
    handleLabelChange,
    handleVariableNameChange,
    handleShapeTypeChange,
    handleNodeDelete,
    handleFrameTitleChange,
    handleFrameDirectionChange,
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
    (event, connectionState) => {
      if (!connectingNodeId.current) return;

      // 既存のノードに接続された場合は新しいノードを作成しない
      if (connectingNodeId.current === "connected") {
        connectingNodeId.current = null;
        return;
      }

      // ノード・枠の接続点の上で離したが繋げなかった (枠と自分の中を結ぶ線は繋がせない, spec 16 裁定 2) 時も作らない。
      // 枠の本体は押す操作を受けないので、離した所の要素は空いた所 (pane) に見える
      if (connectionState?.toHandle || connectionState?.toNode) {
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

  // 「枠を追加」(spec 15 D5、裁定 2)。空の枠を今の画面の中央に置く。枠はノードより下に描かせたいので配列の先頭に入れる
  const addFrame = useCallback(() => {
    // 画面 (xyflow の描画域) の中央を図の座標にする
    const { width, height } = storeApi.getState();
    const { x, y, zoom } = getViewport();
    const middle = { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
    setNodes((nds) => {
      const { variableName, title } = nextFrameName(nds);
      const frame: Node = {
        id: `frame-${variableName}-${Date.now()}`,
        type: SUBGRAPH_NODE_TYPE,
        style: FRAME_NODE_STYLE,
        position: {
          x: middle.x - NEW_FRAME_SIZE.width / 2,
          y: middle.y - NEW_FRAME_SIZE.height / 2,
        },
        ...NEW_FRAME_SIZE,
        data: {
          variableName,
          title,
          onVariableNameChange: handleVariableNameChange,
          onTitleChange: handleFrameTitleChange,
          onDirectionChange: handleFrameDirectionChange,
          onDelete: handleNodeDelete,
        },
      };
      return [frame, ...nds];
    });
  }, [
    storeApi,
    getViewport,
    setNodes,
    handleVariableNameChange,
    handleFrameTitleChange,
    handleFrameDirectionChange,
    handleNodeDelete,
  ]);

  // ドラッグを始めた時の位置 (付け替えをやめた時に戻す, spec 16 D7)
  const dragStartRef = useRef<Map<string, Node["position"]>>(new Map());
  const onNodeDragStart = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    dragStartRef.current = new Map(dragged.map((n) => [n.id, { ...n.position }]));
  }, []);

  // ドラッグを終えたら、中心を含む一番内側の枠へ付け替える (spec 15 D5)。自分と子孫の枠には入れない。
  // 付け替えで枠と自分の中を結ぶようになる線は描画されない (spec 16 裁定 2) ので、確かめてから消す。やめたらドラッグの前の位置へ戻す
  const onNodeDragStop = useCallback(
    async (_: unknown, __: Node, dragged: Node[]) => {
      const before = getNodes();
      const after = applyDrop(
        before,
        dragged.map((n) => n.id)
      );
      const broken = edgesBrokenByDrop(before, after, getEdges());
      if (broken.length === 0) {
        setNodes(after);
        return;
      }
      const ok = await askDelete(
        "この移動で、線が描画されなくなります",
        `枠とその中を結ぶ線 ${broken.length} 本は Mermaid の描画で見えないので消します。消さずに戻す時は「やめる」。`,
        "移動して線を消す"
      );
      if (!ok) {
        const start = dragStartRef.current;
        setNodes((nds) => nds.map((n) => (start.has(n.id) ? { ...n, position: start.get(n.id)! } : n)));
        return;
      }
      const brokenIds = new Set(broken.map((e) => e.id));
      setNodes(after);
      setEdges((eds) => eds.filter((e) => !brokenIds.has(e.id)));
    },
    [getNodes, getEdges, setNodes, setEdges, askDelete]
  );

  // 枠と自分の中を結ぶ線は繋がせない (spec 16 裁定 2)
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => !intoOwnFrame(getNodes(), connection.source, connection.target),
    [getNodes]
  );

  // 削除の前の確認。枠を消す時は枠だけ消し、中身は 1 段上へ移して残す (spec 15 D5、裁定 3)。
  // xyflow は親を消すと子も消す一覧を渡してくるので、消す一覧を計画で置き換え、先に子を付け替える
  const onBeforeDelete: OnBeforeDelete = useCallback(
    async ({ nodes: requested, edges: requestedEdges }) => {
      const all = getNodes();
      // 名指しの削除 (メニュー・枠の ×) か、選択の削除 (Backspace) か
      const named = namedDeleteRef.current !== null;
      namedDeleteRef.current = null;
      const plan = planFrameDelete(all, requested, requestedEdges, { bySelection: !named });
      if (plan.frames.length === 0) return confirmNodeDelete({ nodes: requested, edges: requestedEdges });
      const others = plan.remove.length - plan.frames.length;
      const name = String((plan.frames[0].data as { title?: unknown }).title || (plan.frames[0].data as { variableName?: unknown }).variableName || "");
      const title =
        plan.remove.length === 1
          ? `枠『${name}』を削除しますか？`
          : others === 0
            ? `選択した ${plan.frames.length} 個の枠を削除しますか？`
            : `選択した ${plan.remove.length} 個（枠 ${plan.frames.length} 個）を削除しますか？`;
      // 枠そのものにつながる線 (枠を指す線, spec 16) も一緒に消える
      const frameIds = new Set(plan.frames.map((f) => f.id));
      const frameEdges = plan.removeEdges.filter((e) => frameIds.has(e.source) || frameIds.has(e.target));
      const body = [
        plan.kept > 0 ? `中のノード・枠 ${plan.kept} 個は残ります（外側へ移します）。` : "",
        frameEdges.length > 0 ? `枠につながる線 ${frameEdges.length} 本も消えます。` : "",
        plan.removeEdges.length > frameEdges.length || others > 0 ? "消すノードにつながっている線も一緒に消えます。" : "",
        "元に戻せません。",
      ].join("");
      if (!(await askDelete(title, body))) return false;
      setNodes(plan.reparent);
      return { nodes: plan.remove, edges: plan.removeEdges };
    },
    [getNodes, setNodes, confirmNodeDelete, askDelete]
  );

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
      // 枠の中は枠の向きで並べ、寸法 (送り) もその向きのものを使う (spec 16 D5)
      const nested = frames.length > 0 ? layoutNested(data, importedDirection, nestedLayoutMetrics) : null;
      const positions = nested ? nested.positions : layoutNodes(data.nodes, data.edges);
      const parentOfNode = new Map(frames.flatMap((f) => f.nodes.map((n) => [n, f.id] as const)));

      // 枠は xyflow の親。親は子より前に並べる (frames は親から順, spec 15 D1)。消す時は onBeforeDelete が中身を残す (裁定 3)
      const frameNodes: Node[] = frames.map((f) => {
        const size = nested?.frameSizes.get(f.id);
        return {
          id: f.id,
          type: SUBGRAPH_NODE_TYPE,
          style: FRAME_NODE_STYLE,
          position: positions.get(f.id) || { x: 0, y: 0 },
          ...(f.parent !== undefined ? { parentId: f.parent } : {}),
          ...(size ? { width: size.width, height: size.height } : {}),
          data: {
            variableName: f.id,
            title: f.title,
            ...(f.direction ? { direction: f.direction } : {}),
            onVariableNameChange: handleVariableNameChange,
            onTitleChange: handleFrameTitleChange,
            onDirectionChange: handleFrameDirectionChange,
            onDelete: handleNodeDelete,
          },
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
      handleFrameTitleChange,
      handleFrameDirectionChange,
    ]
  );

  // Lorelei: MCP の open_in_editor で届いた図を既存の取り込み処理へ流す (デスクトップ版のみ)
  useDesktopOpen<ParsedMermaidData>("flowchart", handleImportMermaid);

  // 枠の向き (spec 16 D4・D6)。ドラッグで位置が変わるたびに全部のノードを描き直さないよう、
  // 親子・枠の向き・線の端・図の向きが変わった時だけ作り直す
  const frameStructure = useMemo(
    () =>
      JSON.stringify([
        direction,
        nodes.map((n) => [
          n.id,
          n.type,
          n.parentId ?? null,
          (n.data as { direction?: unknown }).direction ?? null,
        ]),
        edges.map((e) => [e.source, e.target]),
      ]),
    [nodes, edges, direction]
  );
  const frameDirections = useMemo((): FrameDirections => {
    const [dir, ns, es] = JSON.parse(frameStructure) as [
      GraphType,
      [string, string | undefined, string | null, string | null][],
      [string, string][],
    ];
    const structNodes: Node[] = ns.map(([id, type, parentId, frameDirection]) => ({
      id,
      type,
      position: { x: 0, y: 0 },
      ...(parentId !== null ? { parentId } : {}),
      data: frameDirection !== null ? { direction: frameDirection } : {},
    }));
    const structEdges: Edge[] = es.map(([source, target], i) => ({ id: String(i), source, target }));
    return {
      handles: handleDirections(structNodes, dir),
      notices: frameDirectionNotice(structNodes, structEdges, dir),
    };
  }, [frameStructure]);

  return (
    <Box h="var(--lorelei-editor-h, 100vh)" w="full">
      {/* ノードが接続点の位置を向きに合わせるのに使う。枠の中は枠の向き (spec 16 D6) */}
      <DirectionContext.Provider value={direction}>
      <FrameDirectionsContext.Provider value={frameDirections}>
      <EdgeRouteContext.Provider value={edgeRoutes}>
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
        onBeforeDelete={onBeforeDelete}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        fitView
      >
        <FlowLayout>
          <FlowPanel
            onAddNode={addNode}
            onAddFrame={addFrame}
            onImportMermaid={handleImportMermaid}
            nodes={nodes}
            edges={edges}
            direction={direction}
            onDirectionChange={setDirection}
          />
        </FlowLayout>
      </ReactFlow>
      </EdgeRouteContext.Provider>
      </FrameDirectionsContext.Provider>
      </DirectionContext.Provider>
      {confirmDelete.dialog}
    </Box>
  );
}
