import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "../components/providers";
import { DesktopShell } from "../lib/desktop";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // フォークで Web 版を配る時は、ビルド時に NEXT_PUBLIC_SITE_TITLE で差し替える
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "Mermaid フローチャート エディター",
  description: "Mermaidフローチャートを作成・編集するためのWebベースのツール",
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
