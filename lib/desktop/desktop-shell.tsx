"use client";

import { Box, Flex } from "@yamada-ui/react";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { isTauri } from "./tauri";
import { TitleBar } from "./title-bar";

/**
 * デスクトップ版の外枠 (spec 02 D1)。app/layout.tsx から 1 か所で包む。
 * Web 版 (GitHub Pages) では children をそのまま返し、DOM も見た目も変えない。
 */
export const DesktopShell: FC<{ children: ReactNode }> = ({ children }) => {
  // 静的書き出しの HTML と食い違わないよう、マウント後に判定する (ExportButtons と同じ)
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isTauri()), []);
  if (!desktop) return <>{children}</>;

  return (
    <Flex data-lorelei-desktop="" direction="column" h="100vh" overflow="hidden">
      <TitleBar />
      {/* エディタの Box は h="var(--lorelei-editor-h, 100vh)"。高さの引き算はどこにも書かない (D4) */}
      <Box flex="1" minH="0" style={{ ["--lorelei-editor-h" as string]: "100%" }}>
        {children}
      </Box>
    </Flex>
  );
};
