"use client";

// テーマ (extendTheme で作る。yamada-ui の client module) はクライアント側で作る。
// server component のまま theme.ts を読むと、Next が「Cannot access semantics.colors on the server」で落とす (spec 27 P1)
import { ReactFlowProvider } from "@xyflow/react";
import type { FC } from "@yamada-ui/react";
import { UIProvider } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n, LocaleSync } from "@/components/i18n";
import { theme } from "./theme";
import "@xyflow/react/dist/style.css";

interface AppProvidersProps {
  children: ReactNode;
}

export const AppProviders: FC<AppProvidersProps> = ({ children }) => {
  return (
    <I18nextProvider i18n={i18n}>
      <LocaleSync />
      <UIProvider theme={theme}>
        <ReactFlowProvider>{children}</ReactFlowProvider>
      </UIProvider>
    </I18nextProvider>
  );
};
