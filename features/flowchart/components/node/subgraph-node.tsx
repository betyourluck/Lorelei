"use client";

import { useStore } from "@xyflow/react";
import type { FC } from "@yamada-ui/react";
import { Box, Text } from "@yamada-ui/react";

interface SubgraphNodeProps {
  data: {
    /** Mermaid 上の ID */
    variableName?: string;
    title?: string;
  };
  id: string;
}

/**
 * サブグラフの枠 (spec 15 D1)。xyflow の親ノードで、中のノードは parentId でこの枠に入る。
 * 背景は半透明にする: 枠の外どうしを結ぶ線は枠より下に描かれるので、不透明だと隠れる (P0、getElevatedEdgeZIndex)
 */
export const SubgraphNode: FC<SubgraphNodeProps> = ({ data, id }) => {
  // 子があるか。出し入れで変わるので data ではなくストアの親子の索引から読む
  const empty = useStore((s) => !s.parentLookup.get(id)?.size);
  const title = data.title ?? "";
  return (
    <Box
      w="full"
      h="full"
      bg="rgba(255, 255, 222, 0.45)"
      border="1px solid #aaaa33"
      borderRadius="md"
      position="relative"
      data-testid="subgraph-node"
    >
      <Box
        position="absolute"
        top={1}
        left={2}
        right={2}
        display="flex"
        gap={2}
        alignItems="baseline"
      >
        <Text fontSize="xs" color="gray.500" flexShrink={0}>
          {data.variableName}
        </Text>
        <Text fontWeight="bold" fontSize="sm" lineClamp={1} title={title}>
          {title}
        </Text>
      </Box>
      {empty && (
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
        >
          空の枠は、書き出すと四角いノードとして描かれます
        </Text>
      )}
    </Box>
  );
};
