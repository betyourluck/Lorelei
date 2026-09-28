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

// ヘルプテキストの定数
const HELP_TEXT = `💡 対応しているノード形状: 四角形[label], ダイヤモンド{label}, 円((label)), 六角形{{label}}, スタジアム([label]), 角丸(label)`;

export const ImportModal: FC<ImportModalProps> = ({ open, onClose, onImport }) => {
  const [mermaidCode, setMermaidCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    if (!mermaidCode.trim()) {
      setError("Mermaidコードを入力してください");
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
        setError(
          "有効なMermaidコードが見つかりませんでした。ノードまたはエッジの定義を確認してください。"
        );
        return;
      }

      onImport(parsedData);
      setMermaidCode("");
      onClose();
    } catch {
      setError("Mermaidコードの解析中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setMermaidCode("");
    setError(null);
    onClose();
  };

  const exampleCode = `flowchart TD
    A[開始] --> B{判定}
    B -->|はい| C[処理A]
    B -->|いいえ| D[処理B]
    C --> E[終了]
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
      <ModalHeader>Mermaidコードインポート</ModalHeader>
      <ModalBody pb={2} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidEditorWithPreview
          value={mermaidCode}
          onChange={(value) => {
            setMermaidCode(value);
            setError(null);
          }}
          placeholder={`例:\n${exampleCode}`}
          mermaid="flowchart"
          warnings={flowchartDropWarnings}
          readDropped={readFlowchartDropped}
          defaultHeader={FLOWCHART_DEFAULT_HEADER}
          description={
            <Text fontSize="sm" color="gray.600">
              Mermaidのフローチャートコードを貼り付けてインポートできます
            </Text>
          }
          footer={
            <>
              {error && <ErrorAlert message={error} />}
              <Text fontSize="xs" color="gray.500">
                {HELP_TEXT}
              </Text>
            </>
          }
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={handleClose}>キャンセル</Button>
        <Button
          colorScheme="blue"
          onClick={handleImport}
          loading={isLoading}
          loadingText="インポート中..."
          disabled={!mermaidCode.trim()}
        >
          インポート
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
