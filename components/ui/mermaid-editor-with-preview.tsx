"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Center, Text, VStack } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LazyCodeEditor } from "./lazy-code-editor";
import { MermaidTwoPane } from "./mermaid-code-with-preview";
import { describeDropped, type DroppedItem } from "./mermaid-dropped";
import type { LineWarning } from "./mermaid-intellisense";
import { MermaidPreview } from "./mermaid-preview";
import { useDebouncedValue } from "./use-debounced-value";

/** 打鍵が止まってからプレビューと要約を作り直すまで（打つたびに描くと重い, spec 10 D6） */
const PREVIEW_DELAY_MS = 400;

interface MermaidEditorWithPreviewProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** どのダイアログか（補完の 1 行目を絞る）。両方を受けるダイアログ（デスクトップのインポート）では付けない */
  mermaid?: "flowchart" | "er";
  /** エディタの上に出す説明 */
  description: ReactNode;
  /** エディタの下に出すもの（エラー・ヘルプ） */
  footer?: ReactNode;
  /** 取り込むと消える行の印（黄色の警告, spec 11 D4） */
  warnings?: (text: string) => LineWarning[];
  /** 取り込むと消えるもの（正確な数。取り込みと同じ計算, spec 11 D4） */
  readDropped?: (code: string) => Promise<DroppedItem[]>;
  /** 見出しの無いコードの時に補う見出し（プレビュー・赤線・取り込みで同じ補い, spec 11 D2） */
  defaultHeader?: string;
}

/** 取り込むと消えるものの要約。本文が変わった後・消えた後に届いた結果は捨てる */
function useDroppedSummary(code: string, readDropped?: (code: string) => Promise<DroppedItem[]>): string {
  const [summary, setSummary] = useState("");
  useEffect(() => {
    if (!readDropped || !code.trim()) {
      setSummary("");
      return;
    }
    let stale = false;
    readDropped(code).then(
      (dropped) => {
        if (!stale) setSummary(dropped.length ? describeDropped(dropped) : "");
      },
      () => {
        if (!stale) setSummary("");
      }
    );
    return () => {
      stale = true;
    };
  }, [code, readDropped]);
  return summary;
}

/** インポートのダイアログの本文: 左に書けるエディタ（補完・文法の赤線・消える行の印）、右にプレビュー（spec 10 D6、spec 11 D4） */
export const MermaidEditorWithPreview: FC<MermaidEditorWithPreviewProps> = ({
  value,
  onChange,
  placeholder,
  mermaid,
  description,
  footer,
  warnings,
  readDropped,
  defaultHeader,
}) => {
  const previewCode = useDebouncedValue(value, PREVIEW_DELAY_MS);
  const dropped = useDroppedSummary(previewCode, readDropped);

  return (
    <MermaidTwoPane
      code={
        <VStack gap={2} h="full" minH={0} alignItems="stretch">
          {description}
          <Box flex={1} minH={{ base: 0, md: "xs" }}>
            <LazyCodeEditor
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              mermaid={mermaid}
              intellisense
              status
              warnings={warnings}
              defaultHeader={defaultHeader}
              aria-label="Mermaid コード"
            />
          </Box>
          {dropped && (
            <Text role="status" fontSize="sm" color="warning">
              取り込むと消えるもの: {dropped}
            </Text>
          )}
          {footer}
        </VStack>
      }
      preview={
        previewCode.trim() ? (
          <MermaidPreview code={previewCode} keepLast defaultHeader={defaultHeader} />
        ) : (
          <Center h="full" minH="40" color="gray.500" p="md">
            <Text>左に Mermaid を貼ると、ここに図が出ます</Text>
          </Center>
        )
      }
    />
  );
};
