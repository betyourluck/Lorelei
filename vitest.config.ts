import path from "path";
import { defineConfig } from "vitest/config";

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["__tests__/setup.ts"],
    // この環境では全件を並列に走らせると、変更と無関係に 5 秒の際のテストが順に時間切れになる (failures #3)。
    // 1 件ずつ上限を上げると際限がないので、既定を 15 秒にする
    testTimeout: 15000,
    include: [
      "__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "features/**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}",
    ],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "docs/",
        ".next/",
        "**/*.config.*",
        "**/*.d.ts",
        "app/",
        "components/ui/",
        "__tests__/",
      ],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
    // Storybook統合テストは一時的に除外
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@/components": path.resolve(__dirname, "./components"),
      "@/utils": path.resolve(__dirname, "./utils"),
    },
  },
});
