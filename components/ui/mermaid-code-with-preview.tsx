"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Grid } from "@yamada-ui/react";
import { CopyButton } from "./copy-button";
import { MermaidHighlight } from "./mermaid-highlight";
import { MermaidPreview } from "./mermaid-preview";

interface MermaidCodeWithPreviewProps {
  code: string;
}

/**
 * 左に Mermaid のコード、右に mermaid.js で描いた図 (spec 09 D2)。
 * 広い幅では 2 列で、各列が独立してスクロールする。狭い幅 (md 以下) では上下に積む
 */
export const MermaidCodeWithPreview: FC<MermaidCodeWithPreviewProps> = ({ code }) => {
  return (
    <Grid
      w="full"
      flex={{ base: 1, md: "none" }}
      minH={0}
      templateColumns={{ base: "minmax(0, 1fr) minmax(0, 1fr)", md: "minmax(0, 1fr)" }}
      templateRows={{ base: "minmax(0, 1fr)", md: "auto" }}
      gap="md"
    >
      {/* 枠はスクロールしない。コピーのボタンは枠を基準に右上へ置く */}
      <Box as="section" aria-label="Mermaid コード" position="relative" minH={0}>
        <CopyButton value={code} position="absolute" top={2} right={6} zIndex={1} />
        <MermaidHighlight code={code} h={{ base: "full", md: "auto" }} minHeight="100%" />
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
        <MermaidPreview code={code} />
      </Box>
    </Grid>
  );
};
