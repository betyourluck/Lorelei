"use client";

import type { ParseKeys } from "i18next";
import { useEffect } from "react";
import { useTranslation } from "./use-translation";

/**
 * タブの題を画面の言語に合わせる (spec 31 D7)。題は組み立ての時に metadata で日本語に決まるので、言語が変わったら client 側で書き直す。
 * 組み立ての時に NEXT_PUBLIC_SITE_TITLE で題を差し替えた Web 版 (ライブデモ) は、その題のまま触らない
 */
export const DocumentTitle = ({ titleKey }: { titleKey: ParseKeys }): null => {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SITE_TITLE) return;
    document.title = t(titleKey);
  }, [t, titleKey, i18n.language]);
  return null;
};
