import { ReactFlowProvider } from "@xyflow/react";
import type { FC } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@/__tests__/test-utils";
import { theme } from "@/components/providers/theme";
import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";
import { FlowEditor } from "@/features/flowchart/flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const canvas = () => document.querySelector<HTMLElement>(".react-flow");

// spec 27 D5: xyflow の色 (地・ミニマップ・Controls) は yamada-ui の色モードに合わせ、線の色は色の名で読む
describe.each<[string, FC]>([
  ["フローチャート", FlowEditor],
  ["ER 図", ERDiagramEditor],
])("%s のキャンバスの色 (spec 27 D5)", (_, Editor) => {
  it.each(["light", "dark"] as const)("yamada-ui の色モード %s を xyflow に渡す", async (mode) => {
    render(
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>,
      { providerProps: { theme, colorMode: mode } }
    );
    await waitFor(() => expect(canvas()).toHaveClass(mode));
    expect(canvas()).not.toHaveClass(mode === "dark" ? "light" : "dark");
  });

  it("線の色は色の名 edgeStroke の CSS 変数で読む (ライトは xyflow の既定と同じ値)", async () => {
    render(
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>,
      { providerProps: { theme } }
    );
    await waitFor(() => expect(canvas()).not.toBeNull());
    expect(canvas()!.style.getPropertyValue("--xy-edge-stroke")).toBe(
      "var(--ui-colors-edgeStroke)"
    );
  });
});
