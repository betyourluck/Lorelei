// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import i18next from "eslint-plugin-i18next";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-tauri-dev/**",
      "out/**",
      "docs/**",
      "dist/**",
      "build/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended, // Prettierとの競合を解決
  eslintConfigPrettier,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
        JSX: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
      react: react,
      "react-hooks": reactHooks,
    },
    rules: {
      // importは昇順
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          "newlines-between": "never",
        },
      ],

      // 未使用のimportは削除
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // JSXで{""}は許さない
      "react/jsx-curly-brace-presence": [
        "error",
        {
          props: "never",
          children: "never",
          propElementValues: "always",
        },
      ],

      // React関連の基本ルール
      "react/react-in-jsx-scope": "off", // Next.jsでは不要
      "react/prop-types": "off", // TypeScriptを使用するため
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript関連
      "@typescript-eslint/no-unused-vars": "off", // unused-importsが処理
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      // import typeを強制
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
        },
      ],

      // Import関連
      "import/no-unresolved": "off", // TypeScriptが処理
      "import/no-duplicates": "error",
      "import/first": "error",
      "import/newline-after-import": "error",

      // 一般的なベストプラクティス
      "no-console": "warn",
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  // 画面の言葉は訳のファイルへ (spec 31 D10)。JSX の文字と、画面に出る属性の直書きを止める (日本語の直書きは __tests__/i18n/hardcoded-text.test.ts も見る)。
  // Mermaid の記法・図に書く既定値などの例外は行ごとに eslint-disable-next-line で理由を書く。lib/desktop は spec 34 で入れる
  {
    files: ["app/**/*.tsx", "features/**/*.tsx", "components/**/*.tsx"],
    ignores: ["**/__tests__/**", "**/stories/**", "**/*.test.tsx", "**/*.stories.tsx"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": { include: ["aria-label", "title", "placeholder", "label", "alt"] },
        },
      ],
    },
  },
  storybook.configs["flat/recommended"]
);
