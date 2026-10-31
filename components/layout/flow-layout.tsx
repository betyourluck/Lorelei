import { Background, ControlButton, Controls, MiniMap } from "@xyflow/react";
import type { FC } from "@yamada-ui/react";
import { Map as MapIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "@/components/i18n";
import { ContributionPanel } from "@/components/ui/contribution-panel";
import { useMinimapVisible } from "./use-minimap-visible";

interface FlowLayoutProps {
  children: ReactNode;
}

export const FlowLayout: FC<FlowLayoutProps> = ({ children }) => {
  // 右下のミニマップの出し入れ。2 つのエディタで共通に覚える (spec 26 D4〜D6)
  const [minimapShown, toggleMinimap] = useMinimapVisible();
  const { t } = useTranslation();
  return (
    <>
      <Controls>
        <ControlButton
          aria-label={t("minimap.label")}
          aria-pressed={minimapShown}
          title={minimapShown ? t("minimap.hide") : t("minimap.show")}
          onClick={toggleMinimap}
        >
          {/* Controls の svg は fill: currentColor なので、線で描くアイコンは塗りを消す */}
          <MapIcon style={{ fill: "none" }} />
        </ControlButton>
      </Controls>
      {minimapShown && <MiniMap />}
      <Background />
      {children}
      <ContributionPanel />
    </>
  );
};
