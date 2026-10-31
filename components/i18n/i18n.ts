// 画面の言葉 (spec 31)。i18next の 1 つの instance をここで作り、React からは react-i18next の useTranslation で、
// 部品の外 (純粋な関数) からは呼ばれた時に i18n.t で訳す (spec 31 D6。読み込み時に t を呼ばない)。
// 静的書き出しは組み立ての時に日本語で一度描くので、最初の描画は必ず日本語にし、ブラウザの言語・覚えた言語はマウントの後に当てる (D5)
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/common.json";
import ja from "@/locales/ja/common.json";
import ko from "@/locales/ko/common.json";
import zhHans from "@/locales/zh-Hans/common.json";

/** 選べる言語。足す時は locales/<code>/ に訳を置き、ここに 1 行足す (spec 31 D2)。名はその言語で書く */
export const LOCALES = [
  { code: "ja", name: "日本語" }, // i18n-allow: 言語の名はその言語で書く
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "简体中文" }, // i18n-allow: 言語の名はその言語で書く
  { code: "ko", name: "한국어" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

/** 組み立ての言語。静的書き出しの HTML とブラウザの最初の描画はこの言語 (D5) */
export const BUILD_LOCALE: Locale = "ja";
/** 一覧に合う言語が無い時 (D4) */
export const FALLBACK_LOCALE: Locale = "en";
/** 選んだ言語を覚える localStorage のキー (data_contract UiLocale) */
export const LOCALE_STORAGE_KEY = "mermaid-editor.locale.v1";

export const resources = {
  ja: { common: ja },
  en: { common: en },
  "zh-Hans": { common: zhHans },
  ko: { common: ko },
} as const;

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: BUILD_LOCALE,
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: LOCALES.map((l) => l.code),
  ns: ["common"],
  defaultNS: "common",
  // 資源は同梱なので同期で初期化する (最初の描画で言葉が揃う。事前の描画で Suspense を起こさない)
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnNull: false,
});

const isLocale = (v: string): v is Locale => LOCALES.some((l) => l.code === v);

/** 文字体系の無い中国語の地域のうち、繁体字を使う所 */
const TRADITIONAL_REGIONS = ["tw", "hk", "mo"];

/**
 * ブラウザの言語の並び (navigator.languages) から、選べる言語 (既定は一覧) にある近い言語を選ぶ (spec 31 D4)。
 * 中国語は文字体系 (Hans・Hant) を地域より先に見る (spec 35 D9): zh-Hans-HK は簡体字、zh-Hant-CN は繁体字。
 * 繁体字 (zh-Hant・文字体系の無い zh-TW・zh-HK・zh-MO) は簡体字に寄せない。合うものが無ければ英語
 */
export const detectLocale = (
  languages: readonly string[],
  available: readonly string[] = LOCALES.map((l) => l.code)
): Locale => {
  const pick = (code: string): code is Locale => available.includes(code);
  for (const raw of languages) {
    const [lang, ...rest] = raw.toLowerCase().split("-");
    if (lang === "zh") {
      const script = rest.find((part) => part === "hans" || part === "hant");
      const traditional = script
        ? script === "hant"
        : rest.some((part) => TRADITIONAL_REGIONS.includes(part));
      // 繁体字の利用者に簡体字を出さない。簡体字は選べる時だけ
      const simplified = "zh-Hans";
      if (!traditional && pick(simplified)) return simplified;
      continue;
    }
    if (pick(lang)) return lang;
  }
  return FALLBACK_LOCALE;
};

/** 覚えた言語 (無い・読めない時は null) */
export const storedLocale = (): Locale | null => {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return v && isLocale(v) ? v : null;
  } catch {
    return null;
  }
};

/** 利用者が選んだ言語に切り替えて覚える */
export const setLocale = (locale: Locale): void => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 覚えられない時は今の窓だけ切り替える
  }
  void i18n.changeLanguage(locale);
};
