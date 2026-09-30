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

    await user.click(screen.getByRole("button", { name: "コード生成" }));
    const codeDialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(codeDialog).getByTestId("code-editor")).toHaveTextContent(
        /subgraph O\["O"\]\s+subgraph I\["I"\]\s+A\[A\]\s+B\[B\]\s+end\s+end\s+C\[C\]\s+A --> B\s+B --> C/
      )
    );
  });
});

type User = ReturnType<typeof editor>["user"];

const importCode = async (user: User, code: string) => {
  await screen.findByText("Start");
  await user.click(screen.getByRole("button", { name: "インポート" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("textbox"));
  await user.paste(code);
  await user.click(within(dialog).getByRole("button", { name: "インポート" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

const generatedCode = async (user: User) => {
  await user.click(screen.getByRole("button", { name: "コード生成" }));
  const codeDialog = await screen.findByRole("dialog");
  return within(codeDialog).getByTestId("code-editor");
};

// spec 15 P3: GUI の編集 (D5)。ドラッグでの出し入れは jsdom では d3-drag が動かないので、applyDrop のテストと画面で確かめる
describe("フローチャートの枠の編集", { timeout: 30000 }, () => {
  test("枠を消すと、確認の後に枠だけ消え、中身は外側の枠へ移る (裁定 3)", async () => {
    const { user } = editor();
    await importCode(
      user,
      "flowchart TD\n  subgraph O\n    subgraph I\n      A --> B\n    end\n  end\n  B --> C"
    );
    await waitFor(() => expect(nodeEl("I")).not.toBeNull());
    // user.click は mousedown も送り、d3-drag が jsdom に無い event.view を読んで未処理のエラーになる。選ぶのは click だけでよい
    fireEvent.click(nodeEl("I")!);
    await waitFor(() => expect(nodeEl("I")!.classList.contains("selected")).toBe(true));
    await user.keyboard("{Backspace}");
    expect(await screen.findByText("枠『I』を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText(/中のノード・枠 2 個は残ります/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(nodeEl("I")).toBeNull());
    expect(nodeEl("A")).not.toBeNull();
    expect(nodeEl("B")).not.toBeNull();
    expect(await generatedCode(user)).toHaveTextContent(
      /subgraph O\["O"\]\s+A\[A\]\s+B\[B\]\s+end\s+C\[C\]\s+A --> B\s+B --> C/
    );
  });

  test("「やめる」では何も消えない", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph S\n    A\n  end");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "枠を削除" }));
    await screen.findByText("枠『S』を削除しますか？");
    await user.click(screen.getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(screen.queryByText("枠『S』を削除しますか？")).toBeNull());
    expect(nodeEl("S")).not.toBeNull();
    expect(nodeEl("A")).not.toBeNull();
  });

  test("「枠を追加」で空の枠を置き、コード生成に書かれる", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await user.click(screen.getByRole("button", { name: "枠を追加" }));
    expect(await screen.findByText("グループ1")).toBeInTheDocument();
    expect(screen.getByText("group1")).toBeInTheDocument();
    expect(await generatedCode(user)).toHaveTextContent(
      /subgraph group1\["グループ1"\]\s+end\s+startNode\[Start\]/
    );
  });

  test("枠の題と ID をダブルクリックで変える。ほかのノードとぶつかる ID は確定させない", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph S\n    A\n  end\n  B");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    const frame = within(nodeEl("S")!);
    fireEvent.doubleClick(frame.getAllByText("S")[1]);
    const titleInput = frame.getByRole("textbox", { name: "枠の題" });
    await user.clear(titleInput);
    await user.type(titleInput, "受付{Enter}");
    expect(await frame.findByText("受付")).toBeInTheDocument();

    fireEvent.doubleClick(frame.getByText("S"));
    const idInput = frame.getByRole("textbox", { name: "枠の ID" });
    await user.clear(idInput);
    await user.type(idInput, "B{Enter}");
    // ぶつかるので元の ID のまま
    expect(await frame.findByText("S")).toBeInTheDocument();

    fireEvent.doubleClick(frame.getByText("S"));
    const idInput2 = frame.getByRole("textbox", { name: "枠の ID" });
    await user.clear(idInput2);
    await user.type(idInput2, "uketsuke{Enter}");
    expect(await frame.findByText("uketsuke")).toBeInTheDocument();
    expect(await generatedCode(user)).toHaveTextContent(
      /subgraph uketsuke\["受付"\]\s+A\[A\]\s+end\s+B\[B\]/
    );
  });
});
