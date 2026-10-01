import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "../../../../../__tests__/test-utils";
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

type User = ReturnType<typeof editor>["user"];

const importCode = async (user: User, code: string) => {
  await user.click(screen.getByRole("button", { name: "インポート" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("textbox"));
  await user.paste(code);
  await user.click(within(dialog).getByRole("button", { name: "インポート" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

const nodeEl = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;

// 2026-10-01 spec 16 P2 の tauri dev で見つけた: 同じ ID のノードを持つ別の図を開くと、前の図のラベルが表示に残る
// (ノードの部品がラベルと変数名を最初の 1 回だけ受け取っていた)。MCP で開く・インポートのどちらでも起きる
describe("同じ ID のノードを持つ別の図を開く", { timeout: 30000 }, () => {
  test("ラベルと変数名は新しい図のものになる", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await importCode(user, "flowchart TD\n  A[電話] --> B[記録]");
    await waitFor(() => expect(within(nodeEl("A")!).getByText("電話")).toBeInTheDocument());

    await importCode(user, "flowchart TD\n  A[申込] --> B[確認]");
    await waitFor(() => expect(within(nodeEl("A")!).getByText("申込")).toBeInTheDocument());
    expect(within(nodeEl("B")!).getByText("確認")).toBeInTheDocument();
    expect(within(nodeEl("A")!).queryByText("電話")).toBeNull();
  });

  test("変数名も新しい図のもの (ID が同じでも変数名が違う時)", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    // 取り込みのノードの ID は Mermaid の ID なので、ID が同じなら変数名も同じ。初期図の Start (ID 1、変数名 startNode) を
    // 別の取り込みで ID 1 のノードに置き換える
    await importCode(user, "flowchart TD\n  1[一]");
    await waitFor(() => expect(within(nodeEl("1")!).getByText("一")).toBeInTheDocument());
    expect(within(nodeEl("1")!).queryByText("startNode")).toBeNull();
  });
});
