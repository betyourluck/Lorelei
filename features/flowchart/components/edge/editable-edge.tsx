"use client";

import type { EdgeProps, Edge } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, useStore } from "@xyflow/react";
import { XIcon } from "@yamada-ui/lucide";
import { Input, Box, IconButton, HStack } from "@yamada-ui/react";
import type { MouseEvent, KeyboardEvent } from "react";
import { useState, useRef, useEffect } from "react";
import { adjustEdgeLabelPosition, getCyclicEdgeStyle } from "../../hooks/edge-layout";
import { getArrowTypeSymbol } from "../../hooks/mermaid";
import { useEdgeRoute } from "../../hooks/use-edge-routes";
import type { MermaidArrowType } from "../../types/types";
import { roundedPath } from "../../utils/edge-route";
import { frameSelfLoopPath, type HandleSide } from "../../utils/frame-edit";
import { SUBGRAPH_NODE_TYPE } from "../../utils/subgraph-tree";
import { ArrowTypeSelector } from "./arrow-type-selector";

interface EditableEdgeProps extends EdgeProps {
  data?: {
    label?: string;
    arrowType?: MermaidArrowType;
    onLabelChange?: (edgeId: string, newLabel: string) => void;
    onArrowTypeChange?: (edgeId: string, arrowType: MermaidArrowType) => void;
    onDelete?: (edgeId: string) => void;
    allEdges?: Edge[]; // 全エッジの情報（循環参照検出用）
    enableCyclicEdgeStyling?: boolean; // 循環参照エッジのスタイリングを有効にするか
  };
}

interface EdgeContentProps {
  id: string;
  labelX: number;
  labelY: number;
  data?: EditableEdgeProps["data"];
  /** ラベルの高さ。無ければ付けない */
  zIndex?: number;
}

export function EdgeContent({ id, labelX, labelY, data, zIndex }: EdgeContentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState(data?.label || "");
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 編集していない時は、データのラベルに合わせる (同じ ID の線を持つ別の図を開くと、この部品は使い回される)
  useEffect(() => {
    if (!isEditing) setEdgeLabel(data?.label || "");
  }, [data?.label, isEditing]);

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSubmit = () => {
    setIsEditing(false);
    if (data?.onLabelChange) {
      data.onLabelChange(id, edgeLabel);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !isComposing) {
      handleSubmit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEdgeLabel(data?.label || "");
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleBlur = () => {
    handleSubmit();
  };

  const handleArrowTypeChange = (arrowType: MermaidArrowType) => {
    if (data?.onArrowTypeChange) {
      data.onArrowTypeChange(id, arrowType);
    }
  };

  const handleDelete = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  return (
    <Box
      position="absolute"
      transform={`translate(-50%, -50%) translate(${labelX}px,${labelY}px)`}
      pointerEvents="all"
      className="nodrag nopan"
      zIndex={zIndex}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          value={edgeLabel}
          onChange={(e) => setEdgeLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          size="sm"
          w="120px"
          bg="white"
          border="1px solid"
          borderColor="gray.300"
          fontSize="12px"
          textAlign="center"
        />
      ) : (
        <HStack gap="1" align="center">
          <Box
            onClick={handleClick}
            bg="white"
            p="1"
            px="2"
            borderRadius="md"
            fontSize="xs"
            border="1px solid"
            borderColor="gray.300"
            cursor="pointer"
            minW="20px"
            textAlign="center"
            display="flex"
            alignItems="center"
            gap="1"
          >
            <Box as="span" color="blue.600" fontWeight="bold">
              {getArrowTypeSymbol(data?.arrowType || "arrow")}
            </Box>
            <Box as="span">{edgeLabel || "..."}</Box>
          </Box>
          <ArrowTypeSelector
            currentArrowType={data?.arrowType || "arrow"}
            onArrowTypeChange={handleArrowTypeChange}
          />
          <IconButton
            aria-label="Delete edge"
            icon={<XIcon />}
            size="xs"
            variant="ghost"
            colorScheme="red"
            onClick={handleDelete}
            bg="white"
            border="1px solid"
            borderColor="red.300"
            _hover={{ bg: "red.50" }}
          />
        </HStack>
      )}
    </Box>
  );
}

export function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  source,
  target,
}: EditableEdgeProps) {
  const { getEdges, getNodes } = useReactFlow();
  const allEdges = getEdges();
  const allNodes = getNodes();
  // 枠 (サブグラフ) がある図では、線のラベルを一番上の枠より上に描く。xyflow はラベルをノードより下の層に描くので、
  // 半透明の枠に覆われて薄く見える (spec 15、failures #25)。枠の無い図は今までどおり (高さを付けない)
  const labelZIndex = useStore((s) => {
    let top = -Infinity;
    s.nodeLookup.forEach((n) => {
      if (n.type === SUBGRAPH_NODE_TYPE) top = Math.max(top, n.internals.z);
    });
    return top === -Infinity ? undefined : top + 1;
  });

  // 枠の自己ループは枠の外を回す (spec 16 P3。曲線のままだと枠の真ん中を縦に貫き、中の線のボタンと重なる)。
  // 枠の絶対位置と大きさを "x,y,w,h" の文字列で読む (毎回新しいオブジェクトを返すと、ストアが変わるたびに描き直す)
  const selfLoopFrame = useStore((s) => {
    if (source !== target) return null;
    const n = s.nodeLookup.get(source);
    if (!n || n.type !== SUBGRAPH_NODE_TYPE) return null;
    const { x, y } = n.internals.positionAbsolute;
    return `${x},${y},${n.measured.width ?? n.width ?? 0},${n.measured.height ?? n.height ?? 0}`;
  });

  const currentEdge = { id, source, target };

  const [bezierPath, bezierLabelX, bezierLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const loop = selfLoopFrame
    ? (() => {
        const [x, y, width, height] = selfLoopFrame.split(",").map(Number);
        return frameSelfLoopPath(
          { x, y, width, height },
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          sourcePosition as HandleSide
        );
      })()
    : null;
  // 枠・線より低いノードを貫く線は、外を回した経路で描く (spec 17。計算はエディタが図全体で 1 回)
  const route = useEdgeRoute(id);
  const routed = !loop && route ? route : null;
  const edgePath = loop ? loop.path : routed ? roundedPath(routed.points) : bezierPath;
  const labelX = loop ? loop.labelX : routed ? routed.label.x : bezierLabelX;
  const labelY = loop ? loop.labelY : routed ? routed.label.y : bezierLabelY;

  // 循環参照対応のラベル位置調整 (回した線のボタンは経路の計算で置いたので動かさない)
  const adjusted = adjustEdgeLabelPosition(currentEdge, labelX, labelY, allEdges, allNodes);
  const adjustedX = routed ? labelX : adjusted.adjustedX;
  const adjustedY = routed ? labelY : adjusted.adjustedY;

  // 循環参照対応のエッジスタイル（オプション）
  // ラベル位置調整のみにしたい場合は enableCyclicEdgeStyling: false にする
  const cyclicStyle = getCyclicEdgeStyle(
    currentEdge,
    allEdges,
    data?.enableCyclicEdgeStyling ?? false
  ); // ラベル位置のみ

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={cyclicStyle} />
      <EdgeLabelRenderer>
        <EdgeContent
          id={id}
          labelX={adjustedX}
          labelY={adjustedY}
          data={data}
          zIndex={labelZIndex}
        />
      </EdgeLabelRenderer>
    </>
  );
}
