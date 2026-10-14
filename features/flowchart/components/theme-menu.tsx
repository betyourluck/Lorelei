"use client";

import { ChevronDownIcon, PaletteIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Button, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
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
  return (
    <Menu>
      <MenuButton
        size="sm"
        as={Button}
        startIcon={<PaletteIcon />}
        rightIcon={<ChevronDownIcon fontSize="xl" />}
        aria-label={`テーマ: ${value}`}
        title="出力のテーマ (コード・プレビュー・書き出し)"
      >
        {value}
      </MenuButton>
      <MenuList>
        {MERMAID_THEMES.map((theme) => (
          <MenuItem
            key={theme}
            bgColor={theme === value ? "primary.50" : "transparent"}
            onClick={() => onChange(theme)}
          >
            {theme}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
