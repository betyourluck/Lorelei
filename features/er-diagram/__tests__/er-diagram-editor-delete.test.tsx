import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "../../../__tests__/test-utils";
import { ERDiagramEditor } from "../er-diagram-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/er-diagram/" }));

const editor = () =>
  render(
    <ReactFlowProvider>
      <ERDiagramEditor />
    </ReactFlowProvider>
  );

// spec 06 D0・D1: 見出しのボタン → 確認 (onBeforeDelete) → 削除でテーブルが消える。
// jsdom ではノードの大きさが測れず、xyflow がノードを visibility: hidden にするので、ノードの中のボタンは aria-label で探す (getByRole は隠れた要素の名前を空として扱う)
// エディタ全体を描くので重い。全件を並列に回すと既定の 5 秒を超える (failures #3 と同じ型)
describe("ER 図のテーブル削除", { timeout: 15000 }, () => {
  test("「削除」でテーブルが消える", async () => {
    const { user } = editor();
    expect(await screen.findByDisplayValue("ユーザー")).toBeInTheDocument();
    await user.click(screen.getByLabelText("テーブル『ユーザー』を削除"));
    expect(await screen.findByText("『ユーザー』を削除しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(screen.queryByDisplayValue("ユーザー")).toBeNull());
  });

  test("「やめる」では消えない", async () => {
    const { user } = editor();
    await screen.findByDisplayValue("ユーザー");
    await user.click(screen.getByLabelText("テーブル『ユーザー』を削除"));
    await screen.findByText("『ユーザー』を削除しますか？");
    await user.click(screen.getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(screen.queryByText("『ユーザー』を削除しますか？")).toBeNull());
    expect(screen.getByDisplayValue("ユーザー")).toBeInTheDocument();
  });

  test("テーブル名の入力欄で Backspace を押しても、文字が消えるだけで確認は出ない (spec 06 D4)", async () => {
    const { user } = editor();
    const input = await screen.findByDisplayValue("ユーザー");
    await user.click(input);
    await user.keyboard("{End}{Backspace}");
    expect(screen.getByDisplayValue("ユーザ")).toBeInTheDocument();
    expect(screen.queryByText(/を削除しますか？/)).toBeNull();
  });
});
