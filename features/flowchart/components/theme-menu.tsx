"use client";

import { ChevronDownIcon, PaletteIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Button, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import { useTranslation } from "@/components/i18n";
import { MERMAID_THEMES, type MermaidTheme } from "@/components/ui/mermaid-theme";

interface ThemeMenuProps {
  value: MermaidTheme;
  onChange: (theme: MermaidTheme) => void;
}

/**
 * 出力のテーマの切り替え (spec 24 D6)。コード生成のダイアログに置く (フローチャートと ER 図で共通)。
 * 編集画面の見た目は変えず、生成するコード・プレビュー・書き出しにだけ効く
 */
export const ThemeMenu: FC<ThemeMenuProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuButton
        size="sm"
        as={Button}
        startIcon={<PaletteIcon />}
        rightIcon={<ChevronDownIcon fontSize="xl" />}
        aria-label={t("theme.label", { value })}
        title={t("theme.title")}
      >
        {value}
      </MenuButton>
      <MenuList>
        {MERMAID_THEMES.map((theme) => (
          <MenuItem
            key={theme}
            bgColor={theme === value ? "selected" : "transparent"}
            onClick={() => onChange(theme)}
          >
            {theme}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
