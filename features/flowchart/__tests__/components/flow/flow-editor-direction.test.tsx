import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "../../../../../__tests__/test-utils";
import { FlowEditor } from "../../../flow-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const editor = () =>
  render(
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );

const translate = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};

// spec 07 D1: 図の向き。エディタの状態で、パネルで変えられ、取り込みで読む。接続点は向きに合わせる
// エディタ全体を描くので重い (failures #3 と同じ型で上限を上げる)
describe("フローチャートの向き", { timeout: 15000 }, () => {
  test("パネルで LR にすると、ノードの接続点が左右になる", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    expect(document.querySelector(".react-flow__handle-top")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "図の向き: TD" }));
    await user.click(await screen.findByRole("menuitem", { name: "LR" }));
    await waitFor(() => expect(document.querySelector(".react-flow__handle-left")).not.toBeNull());
    expect(document.querySelector(".react-flow__handle-right")).not.toBeNull();
    expect(document.querySelector(".react-flow__handle-top")).toBeNull();
  });

  test("flowchart LR を取り込むと向きが LR になり、ノードが左から右へ並ぶ", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "インポート" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "flowchart LR\n  A --> B\n  B --> C");
    await user.click(within(dialog).getByRole("button", { name: "インポート" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "図の向き: LR" })).toBeInTheDocument());
    const [a, b, c] = ["A", "B", "C"].map(translate);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(a.y).toBe(b.y);
  });
});
