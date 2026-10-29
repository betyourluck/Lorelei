import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/__tests__/test-utils";
import { theme } from "@/components/providers/theme";
import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";
import { FlowEditor } from "@/features/flowchart/flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

// spec 28 D3: 選んだノード・テーブル・枠の外側に輪を出す (選んでいないものは何も足さない)
const RING = { outlineStyle: "solid", outlineWidth: "3px", outlineOffset: "2px" };

const wrapper = (type: string) => document.querySelector<HTMLElement>(`.react-flow__node-${type}`)!;
/** ノードの見た目の外枠 (xyflow の包みの最初の子) */
const body = (type: string) => wrapper(type).firstElementChild as HTMLElement;
const pane = () => document.querySelector<HTMLElement>(".react-flow__pane")!;
// 押し下げ (mousedown) を出すと d3-drag が jsdom の事件に無い view を読んで未処理のエラーになるので、クリックだけを送る
// (xyflow は nodeDragThreshold > 0 の時、選ぶのをクリックで行う)
const click = (el: HTMLElement) => fireEvent.click(el);

describe("選んだ印 (spec 28 D3)", () => {
  it("フローチャートのノード: 選ぶと輪が出て、何も無い所を押して外すと消える", async () => {
    render(
      <ReactFlowProvider>
        <FlowEditor />
      </ReactFlowProvider>,
      { providerProps: { theme } }
    );
    await waitFor(() => expect(wrapper("editableNode")).not.toBeNull());
    expect(body("editableNode")).not.toHaveStyle({ outlineStyle: "solid" });
    click(wrapper("editableNode"));
    await waitFor(() => expect(wrapper("editableNode")).toHaveClass("selected"));
    expect(body("editableNode")).toHaveStyle(RING);
    click(pane());
    await waitFor(() => expect(wrapper("editableNode")).not.toHaveClass("selected"));
    expect(body("editableNode")).not.toHaveStyle({ outlineStyle: "solid" });
  });

  it("ER 図のテーブル: 選ぶと輪が出て、外すと消える", async () => {
    render(
      <ReactFlowProvider>
        <ERDiagramEditor />
      </ReactFlowProvider>,
      { providerProps: { theme } }
    );
    await waitFor(() => expect(wrapper("erTable")).not.toBeNull());
    expect(body("erTable")).not.toHaveStyle({ outlineStyle: "solid" });
    click(wrapper("erTable"));
    await waitFor(() => expect(wrapper("erTable")).toHaveClass("selected"));
    expect(body("erTable")).toHaveStyle(RING);
    click(pane());
    await waitFor(() => expect(wrapper("erTable")).not.toHaveClass("selected"));
    expect(body("erTable")).not.toHaveStyle({ outlineStyle: "solid" });
  });

  it("枠: 見出しで選ぶと輪が出る (今の濃い縁も残る)", async () => {
    render(
      <ReactFlowProvider>
        <FlowEditor />
      </ReactFlowProvider>,
      { providerProps: { theme } }
    );
    click(await screen.findByRole("button", { name: "枠を追加" }));
    const frame = await screen.findByTestId("subgraph-node");
    click(pane());
    await waitFor(() => expect(wrapper("subgraphNode")).not.toHaveClass("selected"));
    expect(frame).not.toHaveStyle({ outlineStyle: "solid" });
    click(screen.getByTestId("subgraph-header"));
    await waitFor(() => expect(wrapper("subgraphNode")).toHaveClass("selected"));
    expect(frame).toHaveStyle(RING);
  });
});
