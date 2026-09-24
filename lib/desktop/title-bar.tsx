"use client";

import { CircleHelpIcon, MinusIcon, SquareIcon, XIcon } from "@yamada-ui/lucide";
import { Box, HStack, IconButton, Text } from "@yamada-ui/react";
import type { FC, ReactElement } from "react";
import type { WindowAction } from "./tauri";
import { showAbout, windowAction } from "./tauri";

export const TITLE_BAR_HEIGHT = "32px";

/**
 * 自作のタイトルバー (spec 02 D1)。decorations: false の代わり。
 * 移動は data-tauri-drag-region (ダブルクリックの最大化もこれで付く)。ボタンには付けない — 付けると押せなくなる。
 */
export const TitleBar: FC = () => (
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
    <Text data-tauri-drag-region="" px="md" fontSize="sm" fontWeight="semibold" pointerEvents="none">
      Lorelei
    </Text>
    <Box data-tauri-drag-region="" flex="1" h="full" />
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
