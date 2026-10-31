"use client";

import {
  CircleHelpIcon,
  MinusIcon,
  PanelLeftIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "@yamada-ui/lucide";
import { Box, Button, HStack, IconButton, Text } from "@yamada-ui/react";
import type { FC, ReactElement } from "react";
import { LanguageMenu } from "@/components/i18n";
import { ColorModeMenu } from "./color-mode-menu";
import { desktopT, useDesktopTranslation } from "./i18n";
import type { McpStatus } from "./mcp";
import { stateLabel } from "./mcp";
import type { WindowAction } from "./tauri";
import { showAbout, windowAction } from "./tauri";

export const TITLE_BAR_HEIGHT = "32px";

interface Props {
  /** 開いている図の名前 */
  title?: string;
  /** 開けなかった図・保存に失敗した図の注意 */
  warning?: string | null;
  /** 閉じる前の保存に失敗した (D7)。閉じずにここへ出し、「保存せずに閉じる」を選ばせる */
  closeError?: string | null;
  onToggleList?: () => void;
  onForceClose?: () => void;
  /** MCP の待ち受けの状態 (spec 03 D6)。押すと設定が開く */
  mcp?: McpStatus | null;
  onOpenSettings?: () => void;
}

const MCP_COLOR: Record<McpStatus["state"], string> = {
  listening: "green.500",
  stopped: "gray.400",
  failed: "red.500",
  blocked: "red.500",
};

/** タイトルバーのアイコンのボタンの形 (BarButton と画面の色の切り替えで共通) */
const BAR_BUTTON = {
  variant: "ghost",
  size: "sm",
  w: "44px",
  h: TITLE_BAR_HEIGHT,
  rounded: "0",
  color: "textHint",
} as const;

const mcpLabel = (s: McpStatus): string =>
  s.state === "listening"
    ? desktopT("titleBar.mcpListening", { port: s.port })
    : desktopT("titleBar.mcp", { state: stateLabel(s) });

/**
 * 自作のタイトルバー (spec 02 D1)。decorations: false の代わり。
 * 移動は data-tauri-drag-region (ダブルクリックの最大化もこれで付く)。ボタンには付けない — 付けると押せなくなる。
 */
export const TitleBar: FC<Props> = ({
  title,
  warning,
  closeError,
  onToggleList,
  onForceClose,
  mcp,
  onOpenSettings,
}) => {
  const { t } = useDesktopTranslation();
  return (
  <HStack
    as="header"
    role="banner"
    data-tauri-drag-region=""
    h={TITLE_BAR_HEIGHT}
    flexShrink={0}
    gap="0"
    bg="surfaceSubtle"
    borderBottomWidth="1px"
    borderColor="line"
    userSelect="none"
  >
    {onToggleList && (
      <BarButton label={t("titleBar.toggleList")} icon={<PanelLeftIcon />} onClick={onToggleList} />
    )}
    {/* eslint-disable-next-line i18next/no-literal-string -- アプリの名 (固有名) */}
    <Text data-tauri-drag-region="" px="md" fontSize="sm" fontWeight="semibold" pointerEvents="none">
      Lorelei
    </Text>
    {title && (
      <Text data-tauri-drag-region="" fontSize="sm" color="textHint" pointerEvents="none" lineClamp={1}>
        {title}
      </Text>
    )}
    {warning && (
      <HStack data-tauri-drag-region="" gap="xs" px="sm" color="warningText" fontSize="xs" pointerEvents="none">
        <TriangleAlertIcon />
        <Text lineClamp={1}>{warning}</Text>
      </HStack>
    )}
    <Box data-tauri-drag-region="" flex="1" h="full" />
    {closeError && (
      <HStack role="alert" gap="xs" px="sm" color="dangerText" fontSize="xs">
        <Text lineClamp={1} title={closeError}>
          {t("titleBar.closeBlocked")}
        </Text>
        <Button size="xs" colorScheme="red" variant="outline" onClick={onForceClose}>
          {t("titleBar.forceClose")}
        </Button>
      </HStack>
    )}
    {mcp && onOpenSettings && (
      <Button
        aria-label={mcpLabel(mcp)}
        title={t("titleBar.mcpHint", { text: mcp.detail ?? mcpLabel(mcp) })}
        size="xs"
        variant="ghost"
        h={TITLE_BAR_HEIGHT}
        rounded="0"
        fontSize="xs"
        color="textHint"
        gap="xs"
        onClick={onOpenSettings}
      >
        <Box as="span" w="2" h="2" rounded="full" bg={MCP_COLOR[mcp.state]} aria-hidden />
        MCP
      </Button>
    )}
    {/* 画面の色 (spec 27 D2) */}
    {/* 画面の言語 (spec 34 D2) */}
    <LanguageMenu buttonProps={{ ...BAR_BUTTON, _hover: { bg: "surfaceSubtleActive" } }} />
    <ColorModeMenu buttonProps={{ ...BAR_BUTTON, _hover: { bg: "surfaceSubtleActive" } }} />
    <BarButton label={t("titleBar.about")} icon={<CircleHelpIcon />} onClick={() => void showAbout()} />
    <Box w="1px" h="4" bg="line" mx="xs" />
    <WindowButton label={t("titleBar.minimize")} action="minimize" icon={<MinusIcon />} />
    <WindowButton label={t("titleBar.maximize")} action="toggleMaximize" icon={<SquareIcon fontSize="xs" />} />
    <WindowButton label={t("titleBar.close")} action="close" icon={<XIcon />} danger />
  </HStack>
  );
};

const BarButton: FC<{
  label: string;
  icon: ReactElement;
  onClick: () => void;
  danger?: boolean;
}> = ({ label, icon, onClick, danger }) => (
  <IconButton
    aria-label={label}
    title={label}
    icon={icon}
    onClick={onClick}
    {...BAR_BUTTON}
    _hover={danger ? { bg: "#e53935", color: "white" } : { bg: "surfaceSubtleActive" }}
  />
);

const WindowButton: FC<{ label: string; action: WindowAction; icon: ReactElement; danger?: boolean }> = ({
  label,
  action,
  icon,
  danger,
}) => (
  <BarButton label={label} icon={icon} danger={danger} onClick={() => void windowAction(action)} />
);
