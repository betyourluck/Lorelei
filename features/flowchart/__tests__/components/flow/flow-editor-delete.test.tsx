import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "../../../../../__tests__/test-utils";
import { FlowEditor } from "../../../flow-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const editor = () =>
  render(
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );

// spec 06 D0・D2: ノードのメニューの「削除」→ 確認 (onBeforeDelete) → 削除でノードが消える。
// jsdom ではノードの大きさが測れず、xyflow がノードを visibility: hidden にするので、ノードの中のボタンは aria-label で探す
// エディタ全体を描くので重い。全件を並列に回すと既定の 5 秒を超える (failures #3 と同じ型)
describe("フローチャートのノード削除の確認", { timeout: 15000 }, () => {
  const openDelete = async (user: ReturnType<typeof editor>["user"]) => {
    await screen.findByText("Start");
    await user.click(screen.getByLabelText("ノードの操作メニューを開く"));
    await user.click(await screen.findByText("削除"));
  };

  test("「削除」でノードが消える", async () => {
    const { user } = editor();
    await openDelete(user);
    expect(await screen.findByText("『Start』を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText("つながっている線も一緒に消えます。元に戻せません。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(screen.queryByText("Start")).toBeNull());
  });

  test("「やめる」では消えない", async () => {
    const { user } = editor();
    await openDelete(user);
    await screen.findByText("『Start』を削除しますか？");
    await user.click(screen.getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(screen.queryByText("『Start』を削除しますか？")).toBeNull());
    expect(screen.getByText("Start")).toBeInTheDocument();
  });
});
