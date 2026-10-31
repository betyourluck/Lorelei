"use client";

import { useEffect } from "react";
import { detectLocale, i18n, storedLocale } from "./i18n";

/**
 * マウントの後に、覚えた言語 → ブラウザの言語の順で言語を当て、<html lang> を言語に合わせる (spec 31 D4・D5)。
 * 描画の中で navigator・localStorage に触らない (静的書き出しは組み立ての時に Node の上で描くので、最初の描画は組み立ての言語のまま)
 */
export const LocaleSync = (): null => {
  useEffect(() => {
    const setLang = (lng: string) => {
      document.documentElement.lang = lng;
    };
    i18n.on("languageChanged", setLang);
    const next =
      storedLocale() ??
      detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
    if (next !== i18n.language) void i18n.changeLanguage(next);
    else setLang(next);
    return () => i18n.off("languageChanged", setLang);
  }, []);
  return null;
};
