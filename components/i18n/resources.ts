import type ja from "@/locales/ja/common.json";

/**
 * 訳の名前空間とその型 (spec 31 D1・spec 34 D1)。キーの型の元は日本語の訳。
 * フォーク元は common だけを持つ。外から足す名前空間は、この interface を declare module で広げる (interface の併合)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface I18nResources {
  common: typeof ja;
}
