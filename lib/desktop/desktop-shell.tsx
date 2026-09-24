"use client";

import { Box, Flex } from "@yamada-ui/react";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { RegisteredActions } from "./desktop-actions";
import { DesktopActionsProvider } from "./desktop-actions";
import { isTauri } from "./tauri";
import { TitleBar } from "./title-bar";
import { Toolbar } from "./toolbar";

/**
 * フォーク元のキャンバスの左上 (タイトル・切り替え・ボタン) と右上 (上流への GitHub メニュー) のパネルを隠す (spec 02 D2)。
 * 消さずに見えなくするだけなので、パネルの中のモーダルと開閉状態はフォーク元のまま使える
 * (モーダルは Portal で body 側に出る。spec 02 P0-1)。上流への謝辞は About が持つ。
 */
const HIDE_FORK_PANELS = `[data-lorelei-desktop] .react-flow__panel.top.left,
[data-lorelei-desktop] .react-flow__panel.top.right { display: none; }`;

/**
 * デスクトップ版の外枠 (spec 02 D1)。app/layout.tsx から 1 か所で包む。
 * Web 版 (GitHub Pages) では children をそのまま返し、DOM も見た目も変えない。
 */
export const DesktopShell: FC<{ children: ReactNode }> = ({ children }) => {
  // 静的書き出しの HTML と食い違わないよう、マウント後に判定する (ExportButtons と同じ)
  const [desktop, setDesktop] = useState(false);
  const [actions, setActions] = useState<RegisteredActions | null>(null);
  useEffect(() => setDesktop(isTauri()), []);
  if (!desktop) return <>{children}</>;

  return (
    <Flex data-lorelei-desktop="" direction="column" h="100vh" overflow="hidden">
      <style>{HIDE_FORK_PANELS}</style>
      <TitleBar />
      <Toolbar actions={actions} />
      {/* エディタの Box は h="var(--lorelei-editor-h, 100vh)"。高さの引き算はどこにも書かない (D4) */}
      <Box flex="1" minH="0" style={{ ["--lorelei-editor-h" as string]: "100%" }}>
        <DesktopActionsProvider register={setActions}>{children}</DesktopActionsProvider>
      </Box>
    </Flex>
  );
};
