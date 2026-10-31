// 訳のキーを型にする (spec 31 D1)。無いキーは tsc で落ちる。日本語の訳 (組み立ての言語) をキーの元にする
import type ja from "@/locales/ja/common.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: { common: typeof ja };
  }
}
