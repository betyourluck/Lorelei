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
}

/**
 * 自作のタイトルバー (spec 02 D1)。decorations: false の代わり。
 * 移動は data-tauri-drag-region (ダブルクリックの最大化もこれで付く)。ボタンには付けない — 付けると押せなくなる。
 */
export const TitleBar: FC<Props> = ({ title, warning, closeError, onToggleList, onForceClose }) => (
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
