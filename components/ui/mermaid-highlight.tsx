"use client";

import type { BoxProps, FC } from "@yamada-ui/react";
import { Box } from "@yamada-ui/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MermaidHighlightProps {
  code: string;
  showLineNumbers?: boolean;
  minHeight?: string;
  fontSize?: string;
  /** 枠の高さ。指定すると中身がこの高さの中でスクロールする */
  h?: BoxProps["h"];
}

export const MermaidHighlight: FC<MermaidHighlightProps> = ({
  code,
  showLineNumbers = true,
  minHeight = "400px",
  fontSize = "14px",
  h,
}) => {
  return (
    <Box w="full" h={h} borderRadius="md" overflow="auto" border="1px solid" borderColor="border">
      <SyntaxHighlighter
        language="mermaid"
        style={vscDarkPlus}
        showLineNumbers={showLineNumbers}
        customStyle={{
          margin: 0,
          fontSize,
          minHeight,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  );
};
