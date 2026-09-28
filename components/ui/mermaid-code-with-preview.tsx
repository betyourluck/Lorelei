"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Grid } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { LazyCodeEditor } from "./lazy-code-editor";
import { MermaidPreview } from "./mermaid-preview";

interface MermaidTwoPaneProps {
  /** 左の列（コード） */
  code: ReactNode;
  /** 右の列（プレビュー） */
  preview: ReactNode;
}

/**
 * 左にコード、右にプレビューの 2 列の枠（spec 09 D2、spec 10 D6 でインポートと共有）。
 * 広い幅では各列が独立してスクロールする。狭い幅（md 以下）では上下に積む
 */
export const MermaidTwoPane: FC<MermaidTwoPaneProps> = ({ code, preview }) => {
  return (
    <Grid
      w="full"
      flex={{ base: 1, md: "none" }}
      minH={0}
      templateColumns={{ base: "minmax(0, 1fr) minmax(0, 1fr)", md: "minmax(0, 1fr)" }}
      templateRows={{ base: "minmax(0, 1fr)", md: "auto" }}
      gap="md"
    >
      {/* 枠はスクロールしない。中身（エディタ）が自分でスクロールする */}
      <Box
        as="section"
        aria-label="Mermaid コード"
        position="relative"
        minH={{ base: 0, md: "xs" }}
        display="flex"
        flexDirection="column"
      >
        {code}
      </Box>
      <Box
        as="section"
        aria-label="プレビュー"
        minH={{ base: 0, md: "sm" }}
        overflow="auto"
        bg="white"
        color="black"
        borderRadius="md"
        border="1px solid"
        borderColor="border"
      >
        {preview}
      </Box>
    </Grid>
  );
};

interface MermaidCodeWithPreviewProps {
  code: string;
}

/** コード生成のダイアログの本文: 左に読むだけのエディタ、右に mermaid.js で描いた図 */
export const MermaidCodeWithPreview: FC<MermaidCodeWithPreviewProps> = ({ code }) => {
  return (
    <MermaidTwoPane
      code={
        <>
          {/* 右上は検索パネル（Ctrl+F）の閉じるボタンと重なるので、コピーは右下に置く */}
          <CopyButton value={code} position="absolute" bottom={2} right={6} zIndex={300} />
          <LazyCodeEditor value={code} readOnly aria-label="生成された Mermaid コード" />
        </>
      }
      preview={<MermaidPreview code={code} />}
    />
  );
};
