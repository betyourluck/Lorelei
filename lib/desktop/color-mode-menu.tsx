"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "@yamada-ui/lucide";
import type { ColorModeWithSystem, IconButtonProps } from "@yamada-ui/react";
import { IconButton, Menu, MenuButton, MenuItem, MenuList, useColorMode } from "@yamada-ui/react";
import type { FC, ReactElement } from "react";
import { useDesktopTranslation } from "./i18n";

const CHOICES: {
  mode: ColorModeWithSystem;
  label: "light" | "dark" | "system";
  icon: ReactElement;
}[] = [
  { mode: "light", label: "light", icon: <SunIcon /> },
  { mode: "dark", label: "dark", icon: <MoonIcon /> },
  { mode: "system", label: "system", icon: <MonitorIcon /> },
];

/**
 * 画面の色の切り替え (spec 27 D1・D2、data_contract UiColorMode)。タイトルバーの「?」の左に置く。
 * 選んだ色は yamada-ui が localStorage の ui-color-mode に覚える。図の出力の色 (コード生成のテーマ, spec 24) とは別
 */
export const ColorModeMenu: FC<{ buttonProps?: Omit<IconButtonProps, "aria-label"> }> = ({
  buttonProps,
}) => {
  const { t } = useDesktopTranslation();
  const { internalColorMode, changeColorMode } = useColorMode();
  const current = CHOICES.find((c) => c.mode === internalColorMode) ?? CHOICES[0];
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        aria-label={t("colorMode.label", { mode: t(`colorMode.${current.label}`) })}
        title={t("colorMode.label", { mode: t(`colorMode.${current.label}`) })}
        icon={current.icon}
        {...buttonProps}
      />
      <MenuList>
        {CHOICES.map((c) => (
          <MenuItem
            key={c.mode}
            icon={c.icon}
            bgColor={c.mode === current.mode ? "selected" : "transparent"}
            onClick={() => changeColorMode(c.mode)}
          >
            {t(`colorMode.${c.label}`)}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
