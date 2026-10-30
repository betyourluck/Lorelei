// spec 30: 2 つのエディタの Undo / Redo (data_contract EditorHistory・HistoryGate)。
// エディタ全体を描くので重い。全件を並列に回すと既定の 5 秒を超える (failures #3 と同じ型)
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/__tests__/test-utils";
import { HistoryGateContext, type HistoryGate } from "@/components/editor-history/gate";
import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";
import { FlowEditor } from "@/features/flowchart/flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const count = () => document.querySelectorAll(".react-flow__node").length;
const undoButton = () => screen.getByRole("button", { name: "元に戻す" });
const redoButton = () => screen.getByRole("button", { name: "やり直す" });

const withGate = (gate: HistoryGate | undefined, children: ReactNode) =>
  gate ? (
    <HistoryGateContext.Provider value={gate}>{children}</HistoryGateContext.Provider>
  ) : (
    children
  );

const flow = (gate?: HistoryGate) =>
  render(
    withGate(
      gate,
      <ReactFlowProvider>
        <FlowEditor />
      </ReactFlowProvider>
    )
  );

describe("フローチャートの Undo / Redo (spec 30)", { timeout: 20000 }, () => {
  test("ノード追加を Ctrl+Z で戻し、Ctrl+Y・Ctrl+Shift+Z でやり直す", async () => {
    const { user } = flow();
    await screen.findByText("Start");
    expect(undoButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(count()).toBe(2));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(count()).toBe(1));
    expect(redoButton()).toBeEnabled();

    await user.keyboard("{Control>}y{/Control}");
    await waitFor(() => expect(count()).toBe(2));

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(count()).toBe(1));
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await waitFor(() => expect(count()).toBe(2));
  });

  test("ボタンでも戻し・やり直せる", async () => {
    const { user } = flow();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    await user.click(undoButton());
    await waitFor(() => expect(count()).toBe(1));
    await user.click(redoButton());
    await waitFor(() => expect(count()).toBe(2));
  });

  test("削除の確認の後に消したノードを戻せる。確認の文に「元に戻せません」は無い", async () => {
    const { user } = flow();
    await screen.findByText("Start");
    await user.click(screen.getByLabelText("ノードの操作メニューを開く"));
    await user.click(await screen.findByText("削除"));
    expect(await screen.findByText("つながっている線も一緒に消えます。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(screen.queryByText("Start")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.keyboard("{Control>}z{/Control}");
    expect(await screen.findByText("Start")).toBeInTheDocument();
  });

  test("文字の入力の中の Ctrl+Z は、図の Undo をしない", async () => {
    const { user } = flow();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    // jsdom ではノードが visibility: hidden になり、role では探せない (er-diagram-editor-delete.test と同じ)
    fireEvent.doubleClick(screen.getByText("Start"));
    await waitFor(() => expect(document.querySelector(".react-flow__node input")).not.toBeNull());
    const input = document.querySelector<HTMLInputElement>(".react-flow__node input")!;
    input.focus();
    await user.keyboard("{Control>}z{/Control}");

    expect(count()).toBe(2);
  });

  test("ダイアログ (コード生成) が開いている間は効かない", async () => {
    const { user } = flow();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "コード生成" }));
    await screen.findByRole("dialog");
    // フォーカスの行き先 (ダイアログの中の CodeMirror) に依らず、文書へ直に送る
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });

    expect(count()).toBe(2);
  });

  test("選ぶだけでは手にならない", async () => {
    flow();
    const start = await screen.findByText("Start");
    fireEvent.click(start);
    await new Promise((r) => setTimeout(r, 100));
    expect(undoButton()).toBeDisabled();
  });

  test("準備ができるまでは記録も戻しもせず、準備ができた時の図を起点にする (デスクトップの開く途中)", async () => {
    const { user, rerender } = flow({ ready: false, epoch: "a" });
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(count()).toBe(2));
    await user.keyboard("{Control>}z{/Control}");
    expect(count()).toBe(2);
    expect(undoButton()).toBeDisabled();

    rerender(
      withGate(
        { ready: true, epoch: "a" },
        <ReactFlowProvider>
          <FlowEditor />
        </ReactFlowProvider>
      )
    );
    await new Promise((r) => setTimeout(r, 100));
    await user.keyboard("{Control>}z{/Control}");
    expect(count()).toBe(2);

    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(count()).toBe(3));
    await waitFor(() => expect(undoButton()).toBeEnabled());
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(count()).toBe(2));
  });

  test("準備ができた後に準備の途中へ戻ると (載せ替え)、その間は記録も戻しもしない", async () => {
    const editor = (ready: boolean) =>
      withGate(
        { ready, epoch: "a" },
        <ReactFlowProvider>
          <FlowEditor />
        </ReactFlowProvider>
      );
    const { user, rerender } = flow({ ready: true, epoch: "a" });
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    rerender(editor(false));
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(count()).toBe(3));
    await new Promise((r) => setTimeout(r, 100));
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(count()).toBe(3);

    // 準備ができた時の図が起点 (途中の変更も、その前の手も戻らない)
    rerender(editor(true));
    await new Promise((r) => setTimeout(r, 100));
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(count()).toBe(3);
  });

  test("epoch が変わると履歴を捨てる (デスクトップで図が替わった時)", async () => {
    const { user, rerender } = flow({ ready: true, epoch: "doc-1" });
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "ノード追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    rerender(
      withGate(
        { ready: true, epoch: "doc-2" },
        <ReactFlowProvider>
          <FlowEditor />
        </ReactFlowProvider>
      )
    );
    await waitFor(() => expect(undoButton()).toBeDisabled());
    await user.keyboard("{Control>}z{/Control}");
    expect(count()).toBe(2);
  });
});

describe("ER 図の Undo / Redo (spec 30)", { timeout: 20000 }, () => {
  test("テーブル追加を Ctrl+Z で戻し、やり直す", async () => {
    const { user } = render(
      <ReactFlowProvider>
        <ERDiagramEditor />
      </ReactFlowProvider>
    );
    await screen.findByDisplayValue("ユーザー");
    await user.click(screen.getByRole("button", { name: "テーブル追加" }));
    await waitFor(() => expect(count()).toBe(2));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(count()).toBe(1));
    await user.keyboard("{Control>}y{/Control}");
    await waitFor(() => expect(count()).toBe(2));
  });

  test("テーブル名の入力欄の中の Ctrl+Z は、図の Undo をしない", async () => {
    const { user } = render(
      <ReactFlowProvider>
        <ERDiagramEditor />
      </ReactFlowProvider>
    );
    const name = await screen.findByDisplayValue("ユーザー");
    await user.click(screen.getByRole("button", { name: "テーブル追加" }));
    await waitFor(() => expect(undoButton()).toBeEnabled());

    name.focus();
    await user.keyboard("{Control>}z{/Control}");

    expect(count()).toBe(2);
  });
});
