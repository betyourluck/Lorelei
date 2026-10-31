// 訳のキーを型にする (spec 31 D1)。無いキーは tsc で落ちる。名前空間の一覧は resources.ts の I18nResources (外から足せる, spec 34 D1)
import type { I18nResources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: I18nResources;
  }
}
