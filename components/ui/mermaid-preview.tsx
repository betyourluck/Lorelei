"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Center, Text } from "@yamada-ui/react";
import { useEffect, useState } from "react";
import { renderMermaid } from "./mermaid-render";

type PreviewState =
  | { status: "loading" }
  | { status: "done"; svg: string }
  | { status: "error"; message: string };

let previewSeq = 0;
/** mermaid の render に渡す id。描くたびに新しくする (英字で始め、英数とハイフンだけ) */
const nextPreviewId = () => `mermaid-preview-${++previewSeq}`;

interface MermaidPreviewProps {
  code: string;
}

/** Mermaid を mermaid.js で描いて見せる (spec 09 D3) */
export const MermaidPreview: FC<MermaidPreviewProps> = ({ code }) => {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    // コードが変わった後・消えた後 (StrictMode の二度走りを含む) に届いた結果は捨てる
    let stale = false;
    setState({ status: "loading" });
    renderMermaid(nextPreviewId(), code).then(
      (svg) => {
        if (!stale) setState({ status: "done", svg });
      },
      (e: unknown) => {
        if (!stale) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    );
    return () => {
      stale = true;
    };
  }, [code]);

  if (state.status === "loading") {
    return (
      <Center h="full" minH="40" color="muted">
        <Text>描いています…</Text>
      </Center>
    );
  }

  if (state.status === "error") {
    return (
      <Box role="alert" p="md" color="danger">
        <Text fontWeight="bold" mb="sm">
          描けませんでした
        </Text>
        <Text as="pre" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all">
          {state.message}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      p="md"
      // mermaid が付ける max-width に加えて、列の幅に収める
      sx={{ "& svg": { maxW: "100%", h: "auto" } }}
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
};
