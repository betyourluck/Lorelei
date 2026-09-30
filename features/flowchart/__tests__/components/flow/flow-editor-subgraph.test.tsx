import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../../../../../__tests__/test-utils";
import { FlowEditor } from "../../../flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const editor = () =>
  render(
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );

const nodeEl = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;

const translate = (id: string) => {
  const m = nodeEl(id)!.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};

// spec 15 P1: 枠 (サブグラフ) を取り込むと枠のノードになり、中のノードは枠の中に並ぶ。コード生成で枠が残る
// エディタ全体を描き、インポートとコード生成の 2 つのダイアログを開くので重い。単独で 4 秒、全件の並列実行で 15 秒を超えたことがある
// (failures #3 と同じ型で上限を上げる)
describe("フローチャートの枠", { timeout: 30000 }, () => {
  test("subgraph を取り込むと枠になり、中のノードが枠の中に並び、コード生成で枠が残る", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "インポート" }));
    const dialog = await screen.findByRole("dialog");
    // 1 字ずつ打つと全件の並列実行で上限を超えるので貼り付ける
    await user.click(within(dialog).getByRole("textbox"));
    await user.paste(
      "flowchart TD\n  subgraph O\n    subgraph I\n      A --> B\n    end\n  end\n  B --> C"
    );
    await user.click(within(dialog).getByRole("button", { name: "インポート" }));
    await waitFor(() => expect(nodeEl("O")).not.toBeNull());

    // 枠は親子の順に並び、中のノードは枠より右下にある (xyflow が親の位置を足して描く)
    expect(nodeEl("O")!.classList.contains("react-flow__node-subgraphNode")).toBe(true);
    expect(nodeEl("I")!.classList.contains("react-flow__node-subgraphNode")).toBe(true);
    const [o, i, a, b, c] = ["O", "I", "A", "B", "C"].map(translate);
    expect(i.x).toBeGreaterThan(o.x);
    expect(i.y).toBeGreaterThan(o.y);
    expect(a.y).toBeGreaterThan(i.y);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    // 枠を消すと xyflow は中身まで消すので、中身を残す消し方 (裁定 3) ができる P3 まで枠は消せない。
    // 枠を選んで Backspace を押しても、確認も出ず何も消えない
    // user.click は mousedown も送り、d3-drag が jsdom に無い event.view を読んで未処理のエラーになる。選ぶのは click だけでよい
    fireEvent.click(nodeEl("I")!);
    await waitFor(() => expect(nodeEl("I")!.classList.contains("selected")).toBe(true));
    await user.keyboard("{Backspace}");
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/を削除しますか/)).toBeNull();
    expect(nodeEl("I")).not.toBeNull();
    expect(nodeEl("A")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "コード生成" }));
    const codeDialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(codeDialog).getByTestId("code-editor")).toHaveTextContent(
        /subgraph O\["O"\]\s+subgraph I\["I"\]\s+A\[A\]\s+B\[B\]\s+end\s+end\s+C\[C\]\s+A --> B\s+B --> C/
      )
    );
  });
});
