import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "../components/providers";
import { DesktopShell } from "../lib/desktop";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // フォークで Web 版を配る時は、ビルド時に NEXT_PUBLIC_SITE_TITLE で差し替える
  // 組み立ての時の題と説明は組み立ての言語 (日本語)。切り替えた時の題は各ページの DocumentTitle が書く (spec 31 D7)
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "Mermaid フローチャート エディター", // i18n-allow: 組み立ての時の題
  description: "Mermaidフローチャートを作成・編集するためのWebベースのツール", // i18n-allow: 組み立ての時の説明
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <AppProviders>
          <DesktopShell>{children}</DesktopShell>
        </AppProviders>
      </body>
    </html>
  );
}
