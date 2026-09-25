import type { Edge, Node } from "@xyflow/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { deleteTitle, needsDeleteConfirm, useConfirmDelete } from "@/components/ui/confirm-delete";

const node = (id: string, name: string): Node => ({ id, position: { x: 0, y: 0 }, data: { name } });
const edge = (id: string): Edge => ({ id, source: "a", target: "b" });

describe("削除の確認の見出し (spec 06 D3)", () => {
  it("1 つなら名前、名前が無ければ種類、2 つ以上なら件数", () => {
    expect(deleteTitle("table", ["会員"])).toBe("『会員』を削除しますか？");
    expect(deleteTitle("node", ["受付"])).toBe("『受付』を削除しますか？");
    expect(deleteTitle("table", [""])).toBe("このテーブルを削除しますか？");
    expect(deleteTitle("node", ["  "])).toBe("このノードを削除しますか？");
    expect(deleteTitle("table", ["会員", "注文", ""])).toBe("選択した 3 個のテーブルを削除しますか？");
    expect(deleteTitle("node", ["a", "b"])).toBe("選択した 2 個のノードを削除しますか？");
  });
});

describe("確認が要るか (spec 06 D4)", () => {
  it("ノード (テーブル) を含む時だけ。辺だけなら要らない", () => {
    expect(needsDeleteConfirm({ nodes: [node("1", "会員")], edges: [] })).toBe(true);
    expect(needsDeleteConfirm({ nodes: [node("1", "会員")], edges: [edge("e")] })).toBe(true);
    expect(needsDeleteConfirm({ nodes: [], edges: [edge("e")] })).toBe(false);
  });
});

describe("useConfirmDelete — onBeforeDelete を確認のダイアログにつなぐ (spec 06 D0・D3)", () => {
  let onBeforeDelete: ReturnType<typeof useConfirmDelete>["onBeforeDelete"];
  const Harness = () => {
    const confirm = useConfirmDelete("table", (n) => String((n.data as { name?: string }).name ?? ""));
    onBeforeDelete = confirm.onBeforeDelete;
    return confirm.dialog;
  };

  it("「削除」なら true、「やめる」なら false。本文は共通", async () => {
    const { user } = render(<Harness />);
    let result: Promise<unknown>;
    act(() => {
      result = onBeforeDelete({ nodes: [node("1", "会員")], edges: [] });
    });
    expect(await screen.findByText("『会員』を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText("つながっている線も一緒に消えます。元に戻せません。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await expect(result!).resolves.toBe(true);

    act(() => {
      result = onBeforeDelete({ nodes: [node("1", "会員"), node("2", "注文")], edges: [] });
    });
    expect(await screen.findByText("選択した 2 個のテーブルを削除しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "やめる" }));
    await expect(result!).resolves.toBe(false);
  });

  it("Esc は「やめる」と同じ", async () => {
    const { user } = render(<Harness />);
    let result: Promise<unknown>;
    act(() => {
      result = onBeforeDelete({ nodes: [node("1", "会員")], edges: [] });
    });
    await screen.findByText("『会員』を削除しますか？");
    await user.keyboard("{Escape}");
    await expect(result!).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByText("『会員』を削除しますか？")).toBeNull());
  });

  it("辺だけの削除はダイアログを出さずに通す", async () => {
    render(<Harness />);
    let result: Promise<unknown>;
    act(() => {
      result = onBeforeDelete({ nodes: [], edges: [edge("e")] });
    });
    await expect(result!).resolves.toBe(true);
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });
});
