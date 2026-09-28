"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Center, Text } from "@yamada-ui/react";
import { useEffect, useState } from "react";
import { renderMermaid } from "./mermaid-render";

interface PreviewState {
  /** 最後に描けた図 */
  svg: string | null;
  /** 今のコードで描けなかった時の文 */
  error: string | null;
  /** 今のコードを描いている途中 */
  loading: boolean;
}

let previewSeq = 0;
/** mermaid の render に渡す id。描くたびに新しくする (英字で始め、英数とハイフンだけ) */
const nextPreviewId = () => `mermaid-preview-${++previewSeq}`;

interface MermaidPreviewProps {
  code: string;
  /**
   * 描いている間・描けない時も、最後に描けた図を残す (spec 10 D6。インポートで打っている途中に図を消さない)。
   * 描けない時は誤りの文を図の上に帯で重ねる
   */
  keepLast?: boolean;
}

/** Mermaid を mermaid.js で描いて見せる (spec 09 D3) */
export const MermaidPreview: FC<MermaidPreviewProps> = ({ code, keepLast = false }) => {
  const [state, setState] = useState<PreviewState>({ svg: null, error: null, loading: true });

  useEffect(() => {
    // コードが変わった後・消えた後 (StrictMode の二度走りを含む) に届いた結果は捨てる
    let stale = false;
    setState((s) => (keepLast ? { ...s, loading: true } : { svg: null, error: null, loading: true }));
    renderMermaid(nextPreviewId(), code).then(
      (svg) => {
        if (!stale) setState({ svg, error: null, loading: false });
      },
      (e: unknown) => {
        if (stale) return;
        const message = e instanceof Error ? e.message : String(e);
        setState((s) => ({ svg: keepLast ? s.svg : null, error: message, loading: false }));
      }
    );
    return () => {
      stale = true;
    };
  }, [code, keepLast]);

  const errorBox = state.error !== null && (
    <Box role="alert" p="md" color="danger" bg={state.svg ? "white" : undefined} borderBottomWidth={state.svg ? "1px" : 0}>
      <Text fontWeight="bold" mb="sm">
        描けませんでした
      </Text>
      <Text as="pre" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all">
        {state.error}
      </Text>
    </Box>
  );

  if (state.svg === null) {
    if (state.error !== null) return errorBox;
    return (
      <Center h="full" minH="40" color="muted">
        <Text>描いています…</Text>
      </Center>
    );
  }

  return (
    <Box position="relative">
      {errorBox && (
        <Box position="sticky" top={0} zIndex={1}>
          {errorBox}
        </Box>
      )}
      <Box
        p="md"
        // mermaid が付ける max-width に加えて、列の幅に収める
        sx={{ "& svg": { maxW: "100%", h: "auto" } }}
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </Box>
  );
};
