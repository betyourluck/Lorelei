"use client";

import { DownloadIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  HStack,
  VStack,
  Text,
  Button,
} from "@yamada-ui/react";
import { useCallback, useState, useMemo } from "react";
import { MermaidCodeWithPreview } from "@/components/ui";
import { ExportButtons } from "@/lib/desktop";
import type { FlowData } from "../../hooks/flow-helpers";
import { generateMermaidCode } from "../../hooks/mermaid";
import type { GraphType } from "../../types/";
import { emptyFrameNames } from "../../utils/subgraph-tree";
import { DirectionMenu } from "../direction-menu";

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  flowData: FlowData;
  /** エディタの向き (ただ 1 つの持ち主)。渡されなければモーダルの中で選ぶ */
  direction?: GraphType;
  onDirectionChange?: (direction: GraphType) => void;
}

export const DownloadModal: FC<DownloadModalProps> = ({
  open,
  onClose,
  flowData,
  direction,
  onDirectionChange,
}) => {
  const [ownGraphType, setOwnGraphType] = useState<GraphType>("TD");
  const currentGraphType = direction ?? ownGraphType;
  const setCurrentGraphType = onDirectionChange ?? setOwnGraphType;

  // 現在選択されている方向でMermaidコードを生成
  const currentMermaidCode = useMemo(() => {
    return generateMermaidCode(flowData, currentGraphType);
  }, [flowData, currentGraphType]);
  // 空の枠はプレビューと書き出しで四角いノードになる (spec 15 D7)
  const emptyFrames = useMemo(() => emptyFrameNames(flowData.nodes), [flowData.nodes]);

  const downloadMermaidCode = useCallback(() => {
    const element = document.createElement("a");
    const file = new Blob([currentMermaidCode], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "flowchart.mmd";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }, [currentMermaidCode]);

  return (
    <Modal open={open} onClose={onClose} maxW="90vw" h="85vh">
      <ModalHeader>
        <VStack gap="xs" align="start">
          <HStack
            justify={{ base: "space-between", md: "flex-start" }}
            display={{ base: "flex", md: "inline-flex" }}
            flexWrap="wrap"
            alignItems="center"
          >
            <Text>生成されたMermaidコード</Text>
            <Button
              startIcon={<DownloadIcon />}
              colorScheme="blue"
              size="sm"
              onClick={downloadMermaidCode}
              ml={{ base: 0, md: "auto" }}
            >
              ダウンロード
            </Button>
            <ExportButtons code={currentMermaidCode} fileStem="flowchart" />

            <DirectionMenu value={currentGraphType} onChange={setCurrentGraphType} />
          </HStack>
          {emptyFrames.length > 0 && (
            <Text fontSize="sm" fontWeight="normal" color="orange.700">
              {`空の枠（${emptyFrames.join("、")}）は、プレビューと書き出しでは四角いノードとして描かれます（中にノードを入れると枠になります）`}
            </Text>
          )}
        </VStack>
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidCodeWithPreview code={currentMermaidCode} />
      </ModalBody>
    </Modal>
  );
};
