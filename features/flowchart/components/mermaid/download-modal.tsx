"use client";

import { DownloadIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Modal, ModalHeader, ModalBody, ModalCloseButton, HStack, Text, Button } from "@yamada-ui/react";
import { useCallback, useState, useMemo } from "react";
import { CopyButton, MermaidHighlight } from "@/components/ui";
import { ExportButtons } from "@/lib/desktop";
import type { FlowData } from "../../hooks/flow-helpers";
import { generateMermaidCode } from "../../hooks/mermaid";
import type { GraphType } from "../../types/";
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
    <Modal open={open} onClose={onClose} size="2xl">
      <ModalHeader>
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
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6} position="relative">
        <CopyButton value={currentMermaidCode} position="absolute" top={2} right={6} zIndex={1} />
        <MermaidHighlight code={currentMermaidCode} />
      </ModalBody>
    </Modal>
  );
};
