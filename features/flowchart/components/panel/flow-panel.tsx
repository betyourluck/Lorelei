"use client";

import { Panel } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { PlusIcon, CodeIcon, UploadIcon, SquareDashedIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { VStack, HStack, Text, Button, useDisclosure } from "@yamada-ui/react";
import { NavigationMenu } from "@/components/ui";
import { useDesktopActions } from "@/lib/desktop";
import type { ParsedMermaidData } from "../../hooks/mermaid";
import type { GraphType } from "../../types/types";
import { DirectionMenu } from "../direction-menu";
import { ImportModal } from "../mermaid";
import { DownloadModal } from "../mermaid/download-modal";

interface FlowPanelProps {
  onAddNode: () => void;
  /** 空の枠 (サブグラフ) を置く (spec 15 D5)。無ければボタンを出さない */
  onAddFrame?: () => void;
  onImportMermaid: (data: ParsedMermaidData) => void;
  nodes: Node[];
  edges: Edge[];
  /** 図の向き (エディタが持つ)。渡されると切り替えを出し、コード生成もこの向きで書く */
  direction?: GraphType;
  onDirectionChange?: (direction: GraphType) => void;
}

type PanelContentProps = FlowPanelProps;

export const FlowPanel: FC<FlowPanelProps> = (props) => {
  return (
    <Panel position="top-left">
      <PanelContent {...props} />
    </Panel>
  );
};

export const PanelContent: FC<PanelContentProps> = ({
  onAddNode,
  onAddFrame,
  onImportMermaid,
  nodes,
  edges,
  direction,
  onDirectionChange,
}) => {
  const { open: openImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { open: openDownload, onOpen: onOpenDownload, onClose: onCloseDownload } = useDisclosure();
  // Lorelei: デスクトップ版のツールバーから呼べるようにする (Web 版では何もしない)
  useDesktopActions({
    add: { label: "ノード追加", run: onAddNode },
    code: onOpenDownload,
    direction,
    setDirection: onDirectionChange,
    addFrame: onAddFrame,
  });

  return (
    <VStack gap={4} p={4} bg="white" borderRadius="md" boxShadow="md">
      <HStack
        w="full"
        display={{ base: "flex", sm: "inline-flex" }}
        flexWrap="wrap"
        justify="space-between"
      >
        <Text fontSize="lg" fontWeight="bold">
          Mermaid フローチャート エディター
        </Text>
        <NavigationMenu />
      </HStack>
      <VStack gap={2} align="start">
        <Text fontSize="sm" color="gray.600">
          💡 ヒント: ノードをダブルクリックで編集、ドラッグして空の場所で新ノード作成
        </Text>
        <HStack gap={2} display={{ base: "flex", md: "inline-flex" }} flexWrap="wrap">
          <Button startIcon={<PlusIcon />} colorScheme="blue" size="sm" onClick={onAddNode}>
            ノード追加
          </Button>
          {onAddFrame && (
            <Button startIcon={<SquareDashedIcon />} colorScheme="yellow" variant="outline" size="sm" onClick={onAddFrame}>
              枠を追加
            </Button>
          )}
          <Button startIcon={<CodeIcon />} colorScheme="green" size="sm" onClick={onOpenDownload}>
            コード生成
          </Button>
          <Button startIcon={<UploadIcon />} colorScheme="purple" size="sm" onClick={onOpenImport}>
            インポート
          </Button>
          {direction && onDirectionChange && <DirectionMenu value={direction} onChange={onDirectionChange} />}
        </HStack>
      </VStack>
      <ImportModal open={openImport} onClose={onCloseImport} onImport={onImportMermaid} />
      <DownloadModal
        open={openDownload}
        onClose={onCloseDownload}
        flowData={{ nodes, edges }}
        direction={direction}
        onDirectionChange={onDirectionChange}
      />
    </VStack>
  );
};
