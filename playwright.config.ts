import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    // テストは日本語の名で要素を探す。ブラウザの言語で画面の言語が変わる (spec 31) ので日本語に固定する
    locale: "ja-JP",
  },
});
