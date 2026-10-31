"use client";

import { LanguagesIcon } from "@yamada-ui/lucide";
import { IconButton, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import { LOCALES, setLocale } from "./i18n";
import { useTranslation } from "./use-translation";

/**
 * 画面の言語のメニュー (spec 31 D9)。地球のアイコンを押すと、言語の名をその言語で並べる。選ぶとすぐ全部の言葉が変わり、覚える。
 * Web 版はパネルの見出しに置く (デスクトップでは見出しごと隠れる。デスクトップの置き場所は spec 34)
 */
export const LanguageMenu = () => {
  const { t, i18n } = useTranslation();
  const current = LOCALES.find((l) => l.code === i18n.language) ?? LOCALES[0];
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        icon={<LanguagesIcon />}
        size="sm"
        variant="outline"
        aria-label={t("language.label", { name: current.name })}
        title={t("language.title")}
      />
      <MenuList>
        {LOCALES.map((locale) => (
          <MenuItem
            key={locale.code}
            lang={locale.code}
            bg={locale.code === current.code ? "selected" : undefined}
            onClick={() => setLocale(locale.code)}
          >
            {locale.name}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
