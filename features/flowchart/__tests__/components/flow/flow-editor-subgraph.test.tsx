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

  test("枠の × で消す時は、中のノードを選んでいても枠だけ消す (2026-09-30 tauri dev で利用者が見つけた)", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph S\n    A --> B\n  end");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    fireEvent.click(nodeEl("A")!);
    await waitFor(() => expect(nodeEl("A")!.classList.contains("selected")).toBe(true));
    await user.click(screen.getByRole("button", { name: "枠を削除" }));
    expect(await screen.findByText("枠『S』を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText(/中のノード・枠 2 個は残ります/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(nodeEl("S")).toBeNull());
    expect(nodeEl("A")).not.toBeNull();
    expect(nodeEl("B")).not.toBeNull();
  });

  test("枠の本体は押す操作を受けず、見出しだけが受ける (枠の中の線のボタンを押せるように。2026-09-30 配布ビルドで利用者が見つけた)", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph S\n    A --> B\n  end");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    expect(nodeEl("S")!.style.pointerEvents).toBe("none");
    expect(within(nodeEl("S")!).getByTestId("subgraph-header").style.pointerEvents).toBe("all");
    // 中のノードは今までどおり受ける
    expect(nodeEl("A")!.style.pointerEvents).toBe("all");
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

const handleSides = (id: string) =>
  Array.from(
    nodeEl(id)!.querySelectorAll(":scope > .react-flow__handle, :scope .react-flow__handle")
  )
    .filter((h) => h.closest(".react-flow__node") === nodeEl(id))
    .map(
      (h) =>
        `${h.classList.contains("source") ? "source" : "target"}:${(h.className.match(/react-flow__handle-(top|bottom|left|right)/) ?? [])[1]}`
    )
    .sort();

// spec 16 P1: 枠の中の向きと枠を指す線を取り込み、枠の中は書いた向きで並べ、接続点もその向き。描画で効く向きが違えば見出しで知らせる
describe("フローチャートの枠の向きと枠を指す線", { timeout: 30000 }, () => {
  test("枠の中の向きで並べ・接続点を向け、枠を指す線を持ち、コード生成で残す", async () => {
    const { user } = editor();
    await importCode(
      user,
      "flowchart TD\n  X\n  subgraph S\n    direction LR\n    a --> b\n  end\n  X --> S\n  S --> Y\n"
    );
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    // S の中は LR: a の右に b
    expect(translate("b").x).toBeGreaterThan(translate("a").x);
    // 中のノードの接続点は枠の向き (入口 左・出口 右)、枠と枠の外のノードは図の向き (入口 上・出口 下)
    await waitFor(() => expect(handleSides("a")).toEqual(["source:right", "target:left"]));
    expect(handleSides("S")).toEqual(["source:bottom", "target:top"]);
    expect(handleSides("X")).toEqual(["source:bottom", "target:top"]);
    // 枠を指す線が描かれるかは jsdom では見られない (ノードの大きさを測れず、xyflow が線を描かない)。Web 版の画面で確かめる。
    // 線がエディタに入っていることは下のコード生成で確かめる
    // 枠を指す線だけなら S の中の向きは描画でも効くので、知らせは出ない
    expect(within(nodeEl("S")!).queryByTestId("subgraph-direction-notice")).toBeNull();
    expect(
      within(nodeEl("S")!).getByRole("button", { name: "枠の中の向き: LR" })
    ).toBeInTheDocument();
    expect(await generatedCode(user)).toHaveTextContent(
      /subgraph S\["S"\]\s+direction LR\s+a\[a\]\s+b\[b\]\s+end\s+X\[X\]\s+Y\[Y\]\s+a --> b\s+X --> S\s+S --> Y/
    );
  });

  test("描画で効く向きが違う枠は、見出しで理由とともに知らせる", async () => {
    const { user } = editor();
    await importCode(
      user,
      "flowchart TD\n  subgraph S\n    direction LR\n    a --> b\n  end\n  b --> Y\n  subgraph T\n    c --> d\n  end\n"
    );
    await waitFor(() => expect(nodeEl("T")).not.toBeNull());
    expect(within(nodeEl("S")!).getByTestId("subgraph-direction-notice")).toHaveTextContent(
      "中のノードが枠の外とつながっているので、描画ではこの向き（LR）は効きません（TB で並びます）"
    );
    // T は向きを書いておらず外とつながらないので、描画では横に並ぶ (エディタは図の向きの縦)
    expect(translate("d").y).toBeGreaterThan(translate("c").y);
    expect(within(nodeEl("T")!).getByTestId("subgraph-direction-notice")).toHaveTextContent(
      "描画では、この枠の中は LR（左から右）に並びます"
    );
  });
});

// spec 16 P3: GUI の編集 (D7)。線を引く・ドロップの確認はドラッグなので jsdom では見られない (frame-edit のテストと画面で確かめる)
describe("フローチャートの枠の向きと枠を指す線の編集", { timeout: 30000 }, () => {
  test("見出しのメニューで枠の向きを変え、指定なしに戻せる。中のノードの接続点も変わる", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph S\n    a --> b\n  end");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    await waitFor(() => expect(handleSides("a")).toEqual(["source:bottom", "target:top"]));
    // ノードの中は user.click だと mousedown で d3-drag が jsdom に無い event.view を読んで落ちる (failures #22)。押すのは click だけ
    const menu = within(nodeEl("S")!).getByRole("button", { name: "枠の中の向き: 指定なし" });
    // 押しても枠をドラッグしない (xyflow はドラッグを始める要素の祖先に nodrag があれば始めない)
    expect(menu.closest(".nodrag")).not.toBeNull();
    fireEvent.click(menu);
    await user.click(await screen.findByRole("menuitem", { name: "LR" }, { timeout: 3000 }));
    await waitFor(() => expect(handleSides("a")).toEqual(["source:right", "target:left"]));
    expect(await generatedCode(user)).toHaveTextContent(
      /subgraph S\["S"\]\s+direction LR\s+a\[a\]/
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(within(nodeEl("S")!).getByRole("button", { name: "枠の中の向き: LR" }));
    await user.click(await screen.findByRole("menuitem", { name: "指定なし" }, { timeout: 3000 }));
    await waitFor(() => expect(handleSides("a")).toEqual(["source:bottom", "target:top"]));
    expect(await generatedCode(user)).not.toHaveTextContent(/direction/);
  });

  test("枠を消す確認に、枠につながる線も消えることを書く", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  X\n  subgraph S\n    a\n  end\n  X --> S\n  S --> Y");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    await user.click(within(nodeEl("S")!).getByRole("button", { name: "枠を削除" }));
    expect(await screen.findByText("枠『S』を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText(/枠につながる線 2 本も消えます/)).toBeInTheDocument();
  });

  test("枠の ID を変えても枠を指す線は外れない", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  X\n  subgraph S\n    a\n  end\n  X --> S");
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    const frame = within(nodeEl("S")!);
    fireEvent.doubleClick(frame.getAllByText("S")[0]);
    const idInput = frame.getByRole("textbox", { name: "枠の ID" });
    await user.clear(idInput);
    await user.type(idInput, "uketsuke{Enter}");
    expect(await frame.findByText("uketsuke")).toBeInTheDocument();
    expect(await generatedCode(user)).toHaveTextContent(/X --> uketsuke/);
  });

  test("見出しの知らせは 1 行に収め、全文は title に出す (狭い枠で中のノードに重ならない)", async () => {
    const { user } = editor();
    await importCode(
      user,
      "flowchart TD\n  subgraph S\n    direction LR\n    a --> b\n  end\n  b --> Y"
    );
    await waitFor(() => expect(nodeEl("S")).not.toBeNull());
    const notice = within(nodeEl("S")!).getByTestId("subgraph-direction-notice");
    expect(notice).toHaveAttribute(
      "title",
      "中のノードが枠の外とつながっているので、描画ではこの向き（LR）は効きません（TB で並びます）"
    );
  });
});
