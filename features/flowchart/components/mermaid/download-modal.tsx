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
import { useTranslation } from "@/components/i18n";
import { MermaidCodeWithPreview } from "@/components/ui";
import type { MermaidTheme } from "@/components/ui/mermaid-theme";
import { ExportButtons, useMmdDownload } from "@/lib/desktop";
import type { FlowData } from "../../hooks/flow-helpers";
import { generateMermaidCode } from "../../hooks/mermaid";
import type { GraphType } from "../../types/";
import { emptyFrameNames } from "../../utils/subgraph-tree";
import { DirectionMenu } from "../direction-menu";
import { ThemeMenu } from "../theme-menu";

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  flowData: FlowData;
  /** エディタの向き (ただ 1 つの持ち主)。渡されなければモーダルの中で選ぶ */
  direction?: GraphType;
  onDirectionChange?: (direction: GraphType) => void;
  /** 出力のテーマ (エディタが持つ, spec 24)。渡されなければモーダルの中で選ぶ */
  theme?: MermaidTheme;
  onThemeChange?: (theme: MermaidTheme) => void;
}

export const DownloadModal: FC<DownloadModalProps> = ({
  open,
  onClose,
  flowData,
  direction,
  onDirectionChange,
  theme,
  onThemeChange,
}) => {
  const { t } = useTranslation();
  const [ownGraphType, setOwnGraphType] = useState<GraphType>("TD");
  const currentGraphType = direction ?? ownGraphType;
  const setCurrentGraphType = onDirectionChange ?? setOwnGraphType;
  const [ownTheme, setOwnTheme] = useState<MermaidTheme>("default");
  const currentTheme = theme ?? ownTheme;
  const setCurrentTheme = onThemeChange ?? setOwnTheme;

  // 現在選択されている方向でMermaidコードを生成
  const currentMermaidCode = useMemo(() => {
    return generateMermaidCode(flowData, currentGraphType, currentTheme);
  }, [flowData, currentGraphType, currentTheme]);
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
  // Lorelei: デスクトップでは保存ダイアログを出して知らせる (Web 版は downloadMermaidCode のまま, spec 25)
  const { download } = useMmdDownload("flowchart", downloadMermaidCode);

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
            <Text>{t("codeModal.title")}</Text>
            <Button
              startIcon={<DownloadIcon />}
              colorScheme="blue"
              size="sm"
              onClick={() => download(currentMermaidCode)}
              ml={{ base: 0, md: "auto" }}
            >
              {t("codeModal.download")}
            </Button>
            <ExportButtons code={currentMermaidCode} fileStem="flowchart" />

            <DirectionMenu value={currentGraphType} onChange={setCurrentGraphType} />
            <ThemeMenu value={currentTheme} onChange={setCurrentTheme} />
          </HStack>
          {emptyFrames.length > 0 && (
            <Text fontSize="sm" fontWeight="normal" color="warningTextStrong">
              {t("codeModal.emptyFrames", {
                names: emptyFrames.join(t("codeModal.listSeparator")),
              })}
            </Text>
          )}
        </VStack>
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidCodeWithPreview code={currentMermaidCode} theme={currentTheme} />
      </ModalBody>
    </Modal>
  );
};
