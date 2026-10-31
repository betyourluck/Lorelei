// デスクトップの外枠の言葉 (spec 34 D1)。名前空間 desktop を、フォーク元の instance (components/i18n) に足す。
// 訳はフォーク元の locales/ に入れず、ここ (lib/desktop/locales/) に持つ (フォーク元のコミットに lib/desktop の名を出さない)。
// 訳を使う lib/desktop のファイルは全部ここを読む (部品だけを描くテストでも訳がある)
import { useTranslation } from "react-i18next";
import { i18n } from "@/components/i18n/i18n";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zhHans from "./locales/zh-Hans.json";

declare module "@/components/i18n/resources" {
  interface I18nResources {
    desktop: typeof ja;
  }
}

// 言語の一覧 (components/i18n/i18n.ts の LOCALES) に無い言語の訳は選ばれないので、一覧へ足すより先に置いてよい (spec 35 D6)
export const desktopResources = { ja, en, "zh-Hans": zhHans, ko } as const;
for (const [lng, bundle] of Object.entries(desktopResources))
  i18n.addResourceBundle(lng, "desktop", bundle, true, true);

/** 部品の言葉 (名前空間 desktop。切り替えで描き直す) */
export const useDesktopTranslation = () => useTranslation("desktop", { i18n });

/** 部品の外の言葉。呼ばれた時の言語で訳す (読み込み時に呼ばない, spec 31 D6) */
export const desktopT = i18n.getFixedT(null, "desktop");
