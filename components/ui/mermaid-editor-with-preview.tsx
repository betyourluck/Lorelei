"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Center, Text, VStack } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { LazyCodeEditor } from "./lazy-code-editor";
import { MermaidTwoPane } from "./mermaid-code-with-preview";
import { MermaidPreview } from "./mermaid-preview";
import { useDebouncedValue } from "./use-debounced-value";

/** 打鍵が止まってからプレビューを描き直すまで（打つたびに描くと重い, spec 10 D6） */
const PREVIEW_DELAY_MS = 400;

interface MermaidEditorWithPreviewProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** どのダイアログか（補完の 1 行目を絞る） */
  mermaid: "flowchart" | "er";
  /** エディタの上に出す説明 */
  description: ReactNode;
  /** エディタの下に出すもの（エラー・ヘルプ） */
  footer?: ReactNode;
}

/** インポートのダイアログの本文: 左に書けるエディタ（補完・文法の赤線）、右にプレビュー（spec 10 D6） */
export const MermaidEditorWithPreview: FC<MermaidEditorWithPreviewProps> = ({
  value,
  onChange,
  placeholder,
  mermaid,
  description,
  footer,
}) => {
  const previewCode = useDebouncedValue(value, PREVIEW_DELAY_MS);

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
              aria-label="Mermaid コード"
            />
          </Box>
          {footer}
        </VStack>
      }
      preview={
        previewCode.trim() ? (
          <MermaidPreview code={previewCode} keepLast />
        ) : (
          <Center h="full" minH="40" color="gray.500" p="md">
            <Text>左に Mermaid を貼ると、ここに図が出ます</Text>
          </Center>
        )
      }
    />
  );
};
