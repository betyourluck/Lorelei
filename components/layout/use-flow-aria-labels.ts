import type { AriaLabelConfig } from "@xyflow/react";
import { useTranslation } from "@/components/i18n";

/**
 * xyflow の部品 (Controls のボタン・ミニマップ・ノードと線の読み上げ) の言葉 (spec 31 D7)。
 * 2 つの <ReactFlow> に ariaLabelConfig で渡す。動いた時の読み上げ (ariaLiveMessage) は関数なので xyflow の既定のまま
 */
export const useFlowAriaLabels = (): Partial<AriaLabelConfig> => {
  const { t } = useTranslation();
  return {
    "node.a11yDescription.default": t("xyflow.nodeDescription"),
    "node.a11yDescription.keyboardDisabled": t("xyflow.nodeDescriptionKeyboardDisabled"),
    "edge.a11yDescription.default": t("xyflow.edgeDescription"),
    "controls.ariaLabel": t("xyflow.controls"),
    "controls.zoomIn.ariaLabel": t("xyflow.zoomIn"),
    "controls.zoomOut.ariaLabel": t("xyflow.zoomOut"),
    "controls.fitView.ariaLabel": t("xyflow.fitView"),
    "controls.interactive.ariaLabel": t("xyflow.interactive"),
    "minimap.ariaLabel": t("xyflow.minimap"),
    "handle.ariaLabel": t("xyflow.handle"),
  };
};
