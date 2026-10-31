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
import { erDropWarnings } from "../../utils/drop-warnings";
import { readErForImport } from "../../utils/import-er";
import type { ParsedMermaidERData } from "../../utils/import-mermaid-to-er";

/** 取り込むと消えるもの (取り込みと同じ計算, spec 11 D4) */
const readErDropped = async (code: string) => {
  const result = await readErForImport(code);
  return result.ok ? result.dropped : [];
};

/**
 * ER図インポートモーダルのプロパティ
 */
interface ImportModalProps {
  /** モーダルの表示状態 */
  open: boolean;
  /** モーダルを閉じる関数 */
  onClose: () => void;
  /** インポート実行時のコールバック関数 */
  onImport: (data: ParsedMermaidERData) => void;
}

/**
 * ER図Mermaidコードインポートモーダル
 * @description flowchartのImportModalと同じ設計パターン
 */
export const ImportModal: FC<ImportModalProps> = ({ open, onClose, onImport }) => {
  const { t } = useTranslation();
  const [mermaidCode, setMermaidCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * インポート処理の実行
   * @description 入力されたMermaidコードを解析してER図データに変換
   */
  const handleImport = async () => {
    if (!mermaidCode.trim()) {
      setError(t("importModal.empty"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // mermaid.js で解析して取り込む (spec 11 D1・D3)。文法の誤り・ほかの図は取り込まずに理由を出す
      const result = await readErForImport(mermaidCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const parsedData = result.data;

      if (parsedData.nodes.length === 0 && parsedData.edges.length === 0) {
        setError(t("importModal.erNotFound"));
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

  /**
   * モーダルを閉じる処理
   * @description 入力内容とエラーをリセットしてモーダルを閉じる
   */
  const handleClose = () => {
    setMermaidCode("");
    setError(null);
    onClose();
  };

  /**
   * 例示用のER図コード
   * @description ユーザーが参考にできるサンプルコード
   */
  const exampleCode = `erDiagram
    User {
      int id PK
      varchar(255) name
      varchar(255) email UK
    }
    Post {
      int id PK
      int user_id
      varchar(255) title
    }
    User ||--o{ Post : "has posts"`;

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
      <ModalHeader>{t("importModal.erTitle")}</ModalHeader>
      <ModalBody pb={2} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidEditorWithPreview
          value={mermaidCode}
          onChange={(value) => {
            setMermaidCode(value);
            setError(null);
          }}
          placeholder={t("importModal.example", { code: exampleCode })}
          mermaid="er"
          warnings={erDropWarnings}
          readDropped={readErDropped}
          description={
            <Text fontSize="sm" color="textHint">
              {t("importModal.erDescription")}
            </Text>
          }
          footer={
            <>
              {error && <ErrorAlert message={error} />}
              <Text fontSize="xs" color="textCaption">
                {t("importModal.erHelp")}
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

/**
 * エラー表示コンポーネント
 * @param message エラーメッセージ
 */
const ErrorAlert = ({ message }: { message: string }) => (
  <Alert status="error">
    <AlertIcon />
    <AlertDescription>{message}</AlertDescription>
  </Alert>
);
