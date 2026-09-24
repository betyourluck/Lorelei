"use client";

import {
  CircleHelpIcon,
  MinusIcon,
  PanelLeftIcon,
  SettingsIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "@yamada-ui/lucide";
import { Box, Button, HStack, IconButton, Text } from "@yamada-ui/react";
import type { FC, ReactElement } from "react";
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

const mcpLabel = (s: McpStatus): string =>
  s.state === "listening" ? `MCP: 待ち受け中 127.0.0.1:${s.port}` : `MCP: ${stateLabel(s)}`;

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
}) => (
  <HStack
    as="header"
    role="banner"
    data-tauri-drag-region=""
    h={TITLE_BAR_HEIGHT}
    flexShrink={0}
    gap="0"
    bg="gray.50"
    borderBottomWidth="1px"
    borderColor="gray.200"
    userSelect="none"
  >
    {onToggleList && (
      <BarButton label="図の一覧を開閉" icon={<PanelLeftIcon />} onClick={onToggleList} />
    )}
    <Text data-tauri-drag-region="" px="md" fontSize="sm" fontWeight="semibold" pointerEvents="none">
      Lorelei
    </Text>
    {title && (
      <Text data-tauri-drag-region="" fontSize="sm" color="gray.600" pointerEvents="none" lineClamp={1}>
        {title}
      </Text>
    )}
    {warning && (
      <HStack data-tauri-drag-region="" gap="xs" px="sm" color="orange.600" fontSize="xs" pointerEvents="none">
        <TriangleAlertIcon />
        <Text lineClamp={1}>{warning}</Text>
      </HStack>
    )}
    <Box data-tauri-drag-region="" flex="1" h="full" />
    {closeError && (
      <HStack role="alert" gap="xs" px="sm" color="red.600" fontSize="xs">
        <Text lineClamp={1} title={closeError}>
          保存できないので閉じませんでした
        </Text>
        <Button size="xs" colorScheme="red" variant="outline" onClick={onForceClose}>
          保存せずに閉じる
        </Button>
      </HStack>
    )}
    {mcp && onOpenSettings && (
      <Button
        aria-label={mcpLabel(mcp)}
        title={mcp.detail ?? mcpLabel(mcp)}
        size="xs"
        variant="ghost"
        h={TITLE_BAR_HEIGHT}
        rounded="0"
        fontSize="xs"
        color="gray.600"
        gap="xs"
        onClick={onOpenSettings}
      >
        <Box as="span" w="2" h="2" rounded="full" bg={MCP_COLOR[mcp.state]} aria-hidden />
        MCP
      </Button>
    )}
    {onOpenSettings && <BarButton label="設定" icon={<SettingsIcon />} onClick={onOpenSettings} />}
    <BarButton label="Lorelei について" icon={<CircleHelpIcon />} onClick={() => void showAbout()} />
    <Box w="1px" h="4" bg="gray.200" mx="xs" />
    <WindowButton label="最小化" action="minimize" icon={<MinusIcon />} />
    <WindowButton label="最大化" action="toggleMaximize" icon={<SquareIcon fontSize="xs" />} />
    <WindowButton label="閉じる" action="close" icon={<XIcon />} danger />
  </HStack>
);

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
    variant="ghost"
    size="sm"
    w="44px"
    h={TITLE_BAR_HEIGHT}
    rounded="0"
    color="gray.600"
    _hover={danger ? { bg: "#e53935", color: "white" } : { bg: "gray.200" }}
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
