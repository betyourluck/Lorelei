"use client";

import { Handle, NodeResizeControl, ResizeControlVariant, useStore } from "@xyflow/react";
import { XIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Box, IconButton, Input, Text } from "@yamada-ui/react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { handlePositions } from "../../hooks/direction";
import { useUpdateNodeInternals } from "../../hooks/use-update-node-internals";
import { FRAME_PADDING, FRAME_TITLE_HEIGHT } from "../../utils/frame-edit";
import { useFrameNotice, useHandleDirection } from "../direction-context";

interface SubgraphNodeProps {
  data: {
    /** Mermaid 上の ID */
    variableName?: string;
    title?: string;
    /** 枠の中に書いた向き (spec 16 D1。書いていなければ持たない) */
    direction?: string;
    onTitleChange?: (nodeId: string, title: string) => void;
    /** ID を変える。ほかのノード・枠とぶつかる名前はエディタが確定させない */
    onVariableNameChange?: (nodeId: string, variableName: string) => void;
    onDelete?: (nodeId: string) => void;
  };
  id: string;
  selected?: boolean;
}

/** 大きさのつまみは押す操作を受ける (枠の本体は受けない) */
const RESIZE_STYLE = { pointerEvents: "all" } as const;
/**
 * 接続点も押す操作を受ける (spec 16 D6)。見出し・つまみより後ろの DOM に置くと、接続点の円の上では接続点が一番上になり、
 * 円から離れた所は見出し・つまみが受ける (P0 の 5 で測った。z の指定も外へのずらしも要らない)
 */
const HANDLE_STYLE = { pointerEvents: "all" } as const;

/** 枠の最小の大きさ (中身が無い時) */
const MIN_SIZE = { width: 160, height: 100 };

type Editing = "title" | "id" | null;

/**
 * サブグラフの枠 (spec 15 D1・D5)。xyflow の親ノードで、中のノードは parentId でこの枠に入る。
 * 背景は半透明にする: 枠の外どうしを結ぶ線は枠より下に描かれるので、不透明だと隠れる (P0、getElevatedEdgeZIndex)。
 * 大きさは右・下・右下だけで変える (左・上から変えると枠の位置が動き、中身の相対位置がそのままなので中身がずれる)。中身より小さくはできない
 */
export const SubgraphNode: FC<SubgraphNodeProps> = ({ data, id, selected }) => {
  // 子があるか・子を収める最小の大きさ。出し入れで変わるので data ではなくストアの親子の索引から読む
  const [empty, minWidth, minHeight] = useStore((s) => {
    const children = s.parentLookup.get(id);
    if (!children?.size) return `1,${MIN_SIZE.width},${MIN_SIZE.height}`;
    let w = MIN_SIZE.width;
    let h = MIN_SIZE.height;
    children.forEach((c) => {
      w = Math.max(w, c.position.x + (c.measured.width ?? 0) + FRAME_PADDING);
      h = Math.max(h, c.position.y + (c.measured.height ?? 0) + FRAME_PADDING);
    });
    return `0,${w},${h}`;
  })
    .split(",")
    .map(Number);
  const title = data.title ?? "";
  // 接続点は枠が置かれている入れ物 (外の枠、無ければ図) の向き (spec 16 D6)。変わったら位置を測り直させる
  const handleDirection = useHandleDirection(id);
  const { target, source } = handlePositions(handleDirection);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [handleDirection, id, updateNodeInternals]);
  const notice = useFrameNotice(id);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const composing = useRef(false);

  const start = (what: Exclude<Editing, null>) => {
    setDraft(what === "title" ? title : (data.variableName ?? ""));
    setEditing(what);
  };
  const commit = () => {
    if (editing === "title") data.onTitleChange?.(id, draft);
    if (editing === "id") data.onVariableNameChange?.(id, draft.trim());
    setEditing(null);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !composing.current) commit();
    else if (e.key === "Escape") setEditing(null);
  };
  const input = (label: string) => (
    <Input
      className="nodrag"
      aria-label={label}
      value={draft}
      autoFocus
      size="xs"
      h="22px"
      w={editing === "id" ? "24" : "full"}
      fontSize="sm"
      bg="white"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => (composing.current = false)}
      onBlur={commit}
    />
  );

  return (
    <Box
      w="full"
      h="full"
      bg="rgba(255, 255, 222, 0.45)"
      border={selected ? "2px solid #8a8a1f" : "1px solid #aaaa33"}
      borderRadius="md"
      position="relative"
      data-testid="subgraph-node"
    >
      {/* 右・下・右下だけで大きさを変える。枠の本体は押す操作を受けない (FRAME_NODE_STYLE) ので、つまみは受けるように戻す */}
      {selected && (
        <>
          <NodeResizeControl
            position="right"
            variant={ResizeControlVariant.Line}
            minWidth={minWidth}
            minHeight={minHeight}
            style={RESIZE_STYLE}
          />
          <NodeResizeControl
            position="bottom"
            variant={ResizeControlVariant.Line}
            minWidth={minWidth}
            minHeight={minHeight}
            style={RESIZE_STYLE}
          />
          <NodeResizeControl
            position="bottom-right"
            minWidth={minWidth}
            minHeight={minHeight}
            style={RESIZE_STYLE}
          />
        </>
      )}
      {/* 見出し: 枠を選ぶ・動かす・題と ID を変える・消す所。ここだけ押す操作を受ける */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h={`${FRAME_TITLE_HEIGHT}px`}
        px={2}
        display="flex"
        gap={2}
        alignItems="center"
        cursor="grab"
        style={{ pointerEvents: "all" }}
        data-testid="subgraph-header"
      >
        {editing === "id" ? (
          input("枠の ID")
        ) : (
          <Text
            fontSize="xs"
            color="gray.500"
            flexShrink={0}
            title="ダブルクリックで ID を変える"
            onDoubleClick={() => start("id")}
          >
            {data.variableName}
          </Text>
        )}
        {editing === "title" ? (
          input("枠の題")
        ) : (
          <Text
            fontWeight="bold"
            fontSize="sm"
            lineClamp={1}
            flex="1"
            title="ダブルクリックで題を変える"
            onDoubleClick={() => start("title")}
          >
            {title || "（題なし）"}
          </Text>
        )}
        {data.direction && (
          // 枠の中に書いた向き (spec 16。変えるメニューは P3)
          <Text fontSize="xs" color="gray.500" flexShrink={0} title="枠の中の向き">
            {data.direction}
          </Text>
        )}
        {data.onDelete && (
          <IconButton
            className="nodrag"
            aria-label="枠を削除"
            title="枠を削除（中のノードは残ります）"
            icon={<XIcon />}
            size="xs"
            variant="ghost"
            colorScheme="gray"
            onClick={() => data.onDelete?.(id)}
          />
        )}
      </Box>
      {notice && empty !== 1 && (
        // 描画で効く向きがエディタの向きと違う (spec 16 D4)。見出しのすぐ下に薄く書く。押す操作は受けない
        <Text
          position="absolute"
          top={`${FRAME_TITLE_HEIGHT}px`}
          left={2}
          right={2}
          fontSize="2xs"
          color="gray.500"
          lineClamp={2}
          pointerEvents="none"
          data-testid="subgraph-direction-notice"
        >
          {notice}
        </Text>
      )}
      {/* 枠を指す線の接続点 (spec 16 D6)。見出し・つまみより後ろに置く */}
      <Handle type="target" position={target} style={HANDLE_STYLE} />
      <Handle type="source" position={source} style={HANDLE_STYLE} />
      {empty === 1 && (
        // 空の枠は、Mermaid の描画 (mermaid.js・書き出し) では枠ではなく四角いノードになる (spec 15 D7、裁定 4)
        <Text
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          px={3}
          fontSize="xs"
          color="gray.500"
          pointerEvents="none"
        >
          空の枠は、書き出すと四角いノードとして描かれます
        </Text>
      )}
    </Box>
  );
};
