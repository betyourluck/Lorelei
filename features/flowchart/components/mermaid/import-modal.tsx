"use client";

import type { FC } from "@yamada-ui/react";
import {
  Modal,
  ModalOverlay,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Text,
  Alert,
  AlertIcon,
  AlertDescription,
} from "@yamada-ui/react";
import { useState } from "react";
import { useTranslation } from "@/components/i18n";
import { MermaidEditorWithPreview } from "@/components/ui";
import type { ParsedMermaidData } from "../../hooks/mermaid";
import { flowchartDropWarnings } from "../../utils/drop-warnings";
import { FLOWCHART_DEFAULT_HEADER, readFlowchartForImport } from "../../utils/import-flowchart";

/** 取り込むと消えるもの (取り込みと同じ計算, spec 11 D4) */
const readFlowchartDropped = async (code: string) => {
  const result = await readFlowchartForImport(code);
  return result.ok ? result.dropped : [];
};

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: ParsedMermaidData) => void;
}

export const ImportModal: FC<ImportModalProps> = ({ open, onClose, onImport }) => {
  const { t } = useTranslation();
  const [mermaidCode, setMermaidCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    if (!mermaidCode.trim()) {
      setError(t("importModal.empty"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // mermaid.js で解析して取り込む (spec 11 D1・D3)。文法の誤り・ほかの図は取り込まずに理由を出す
      const result = await readFlowchartForImport(mermaidCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const parsedData = result.data;

      if (parsedData.nodes.length === 0 && parsedData.edges.length === 0) {
        setError(t("importModal.flowNotFound"));
        return;
      }

      onImport(parsedData);
      setMermaidCode("");
      onClose();
    } catch {
      setError(t("importModal.failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setMermaidCode("");
    setError(null);
    onClose();
  };

  // 例の記法はそのまま、ラベルだけ画面の言語で (spec 31 D7)
  const exampleCode = `flowchart TD
    A[${t("importModal.flowExample.start")}] --> B{${t("importModal.flowExample.decision")}}
    B -->|${t("importModal.flowExample.yes")}| C[${t("importModal.flowExample.processA")}]
    B -->|${t("importModal.flowExample.no")}| D[${t("importModal.flowExample.processB")}]
    C --> E[${t("importModal.flowExample.end")}]
    D --> E`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxW="90vw"
      h="85vh"
      // 本文がある時は Esc で閉じない (閉じると本文が消える, spec 10 D6)
      closeOnEsc={!mermaidCode.trim()}
    >
      <ModalOverlay />
      <ModalHeader>{t("importModal.flowTitle")}</ModalHeader>
      <ModalBody pb={2} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidEditorWithPreview
          value={mermaidCode}
          onChange={(value) => {
            setMermaidCode(value);
            setError(null);
          }}
          placeholder={t("importModal.example", { code: exampleCode })}
          mermaid="flowchart"
          warnings={flowchartDropWarnings}
          readDropped={readFlowchartDropped}
          defaultHeader={FLOWCHART_DEFAULT_HEADER}
          description={
            <Text fontSize="sm" color="textHint">
              {t("importModal.flowDescription")}
            </Text>
          }
          footer={
            <>
              {error && <ErrorAlert message={error} />}
              <Text fontSize="xs" color="textCaption">
                {t("importModal.flowHelp")}
              </Text>
            </>
          }
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={handleClose}>{t("importModal.cancel")}</Button>
        <Button
          colorScheme="blue"
          onClick={handleImport}
          loading={isLoading}
          loadingText={t("importModal.importing")}
          disabled={!mermaidCode.trim()}
        >
          {t("importModal.import")}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

const ErrorAlert = ({ message }: { message: string }) => (
  <Alert status="error">
    <AlertIcon />
    <AlertDescription>{message}</AlertDescription>
  </Alert>
);
