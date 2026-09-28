"use client";

import dynamic from "next/dynamic";
import type { CodeEditorProps } from "./code-editor";

/**
 * ダイアログが import するのはこれだけ（spec 10 D1）。CodeMirror（`code-editor.tsx` とそれが読むもの）は
 * エディタを描く時に初めて読む。ダイアログはパネルから静的に読まれるので、ここを通さないと
 * `@codemirror/*` がページの最初の読み込みに入る。テストはこのモジュールを textarea に静的に模擬する（__tests__/setup.ts）
 */
export const LazyCodeEditor = dynamic<CodeEditorProps>(
  () => import("./code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    // 読み込む間は同じ色の箱を出す（白く光らせない）
    loading: () => <div style={{ height: "100%", minHeight: 120, background: "#1e1e1e", borderRadius: 6 }} />,
  }
);
