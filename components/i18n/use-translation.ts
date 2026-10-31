import { useTranslation as useI18nextTranslation } from "react-i18next";
import { i18n } from "./i18n";

/**
 * 部品の言葉を訳す (spec 31)。react-i18next の useTranslation を、ここで作った instance に結んだもの。
 * Provider の無い描画 (部品だけのテスト・stories) でも同じ instance を使い、言語の切り替えで描き直す
 */
export const useTranslation = () => useI18nextTranslation("common", { i18n });
