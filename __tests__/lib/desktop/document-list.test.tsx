import "./pointer-event";
import { fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/__tests__/test-utils";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
const push = vi.fn();
let pathname = "/";
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));

const shell = () =>
  render(
    <ReactFlowProvider>
      <DesktopShell>editor</DesktopShell>
    </ReactFlowProvider>
  );
const list = async () => within(await screen.findByRole("navigation", { name: "図の一覧" }));
// 起動時はエディタ側の最初の取り込みを待つ (エディタが居ないテストでは上限の 1.5 秒)
const LONG = { timeout: 4000 };

// 起動時に最大 1.5 秒待つ設計なので 1 件 2.5〜3 秒かかる。全件を並列に走らせると既定の 5 秒を超える (failures #3 と同じ型) ので上限を上げる
describe("図の一覧 (spec 02 P3)", { timeout: 15000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    pathname = "/";
    push.mockClear();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.clear();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("1 件も無い時は、フローチャートを 1 件作って開く (D9)", async () => {
    shell();
    expect(await screen.findByRole("banner")).toBeInTheDocument();
    await waitFor(() => expect(backend.calls("create_document")).toEqual([{ editor: "flowchart", title: null }]), LONG);
    const items = (await list()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("banner")).toHaveTextContent("無題のフローチャート");
  });

  it("前回開いていた図を開く。無ければ一番新しい図 (D9)", async () => {
    const a = backend.add("flowchart", "注文フロー");
    backend.add("flowchart", "新しい方");
    backend.setLast(a.id);
    shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"), LONG);
    expect(backend.calls("create_document")).toEqual([]);
  });

  it("新規作成で ER 図を選ぶと、ER 図のページへ移って開く", async () => {
    backend.add("flowchart", "注文フロー");
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"), LONG);
    await user.click((await list()).getByRole("button", { name: "新規作成" }));
    await user.click(await screen.findByRole("menuitem", { name: "ER図" }));
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("無題の ER 図"));
    expect(push).toHaveBeenCalledWith("/er-diagram/");
  });

  it("ツールバーの ER図 は、ER 図のうち一番新しいものを開く。無ければ作る (D11)", async () => {
    backend.add("erDiagram", "古い ER");
    backend.add("erDiagram", "新しい ER");
    backend.add("flowchart", "注文フロー");
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"), LONG);
    await user.click(screen.getByRole("button", { name: "ER図" }));
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("新しい ER"));
    expect(backend.calls("create_document")).toEqual([]);
    expect(screen.getByRole("button", { name: "ER図" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ツールバーの ER図 で、ER 図が 1 件も無ければ新しく作る (D11)", async () => {
    backend.add("flowchart", "注文フロー");
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"), LONG);
    await user.click(screen.getByRole("button", { name: "ER図" }));
    await waitFor(() => expect(backend.calls("create_document")).toEqual([{ editor: "erDiagram", title: null }]));
  });

  it("ダブルクリックで名前を変える", async () => {
    backend.add("flowchart", "無題");
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("無題"), LONG);
    await user.dblClick((await list()).getByText("無題"));
    const input = screen.getByRole("textbox", { name: "図の名前" });
    await user.clear(input);
    await user.type(input, "注文フロー{Enter}");
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"));
    expect(backend.calls("rename_document")[0]).toMatchObject({ title: "注文フロー" });
  });

  it("開いている図をごみ箱へ移すと、残りの一番新しい図を開く", async () => {
    backend.add("flowchart", "残る図");
    const doomed = backend.add("flowchart", "消す図");
    backend.setLast(doomed.id);
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("消す図"), LONG);
    await user.click((await list()).getByRole("button", { name: "「消す図」をごみ箱へ" }));
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("残る図"));
    expect(backend.trashed).toEqual([doomed.id]);
    expect((await list()).queryByText("消す図")).toBeNull();
  });

  it("開いている途中の図をごみ箱へ移すと、その図は開かず、残りの図を開く", async () => {
    // 2026-09-25 実機で観測: 開ききる前にその図をごみ箱へ移すと、ごみ箱の図が「今の図」に残り、
    // 自動保存が失敗し続けて (保存できなければ切り替えない) どの図にも移れなくなった
    const stay = backend.add("flowchart", "残る図");
    const doomed = backend.add("flowchart", "消す図", { source: "flowchart TD\n    消す[消す]\n" });
    backend.setLast(stay.id);
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("残る図"), LONG);
    // 「消す図」を読み込んだ後 (変換の待ち) で止めておく。読み込み前にごみ箱へ移ると、読み込みが失敗して開かないので再現しない
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
      if (cmd === "convert_source" && args.source === doomed.source) await gate;
      return real(cmd, args);
    });
    await user.click((await list()).getByText("消す図"));
    await user.click((await list()).getByRole("button", { name: "「消す図」をごみ箱へ" }));
    release();
    await waitFor(() => expect(backend.trashed).toEqual([doomed.id]));
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("残る図"));
    expect(screen.getByRole("banner")).not.toHaveTextContent("消す図");
  });

  it("ツールバーの「保存」で、開いている図を一覧の先頭へ動かす (D12)", async () => {
    const a = backend.add("flowchart", "古い図");
    backend.add("flowchart", "新しい図");
    backend.setLast(a.id);
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("古い図"), LONG);
    expect((await list()).getAllByRole("listitem")[0]).toHaveTextContent("新しい図");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(async () => expect((await list()).getAllByRole("listitem")[0]).toHaveTextContent("古い図"));
    expect(backend.calls("mark_document_saved")).toEqual([{ id: a.id }]);
  });

  it("Ctrl+S でも保存する (D12)", async () => {
    const a = backend.add("flowchart", "図");
    backend.setLast(a.id);
    const { user } = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("図"), LONG);
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(backend.calls("mark_document_saved")).toEqual([{ id: a.id }]));
  });

  it("最後の「保存」より後に変更がある図に ● を付ける (D12)", async () => {
    backend.add("flowchart", "変更あり", { updatedAt: "2026-09-24T13:00:00.000000+09:00" });
    shell();
    const item = (await (await list()).findByText("変更あり", {}, LONG)).closest("li")!;
    await waitFor(() => expect(item).toHaveTextContent("●"));
  });

  it("まだエディタに載っていない AI の図 (source が空) は、初期図でなく原文から開く (spec 04 P0)", async () => {
    // 届いたがエディタが取り込めなかった図 (画面が読み込めなかった等)。source は最初の自動保存まで空のまま残る
    const original = "flowchart LR\n  受付 --> 確認 --> 完了\n";
    const a = backend.add("flowchart", "届いた図", { origin: "ai", originalSource: original });
    backend.setLast(a.id);
    shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("届いた図"), LONG);
    // 空の source を「新規作成の直後」と見なすと、原文を変換せず初期図で準備済みになり、初期図が保存される
    await waitFor(() => expect(backend.calls("convert_source")).toEqual([{ source: original }]));
  });

  it("遅れて効いたページ移動で、今の図と違う種類のページに居たら、今の図のページへ戻す (spec 04 P0)", async () => {
    // 実機で観測 (2026-09-25): 題名はフローの図・キャンバスは ER 図のエディタ、のまま止まった
    backend.add("flowchart", "注文フロー");
    const view = shell();
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("注文フロー"), LONG);
    push.mockClear();
    pathname = "/er-diagram/";
    view.rerender(
      <ReactFlowProvider>
        <DesktopShell>editor</DesktopShell>
      </ReactFlowProvider>
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("banner")).toHaveTextContent("注文フロー");
  });

  it("つまみで一覧の幅を変え、幅と開閉を覚える (spec 05 D1・D3)", async () => {
    const { user } = shell();
    await list();
    const el = screen.getByRole("separator", { name: "図の一覧の幅" });
    expect(screen.getByRole("navigation", { name: "図の一覧" })).toHaveStyle({ width: "240px" });
    fireEvent.pointerDown(el, { clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 300, pointerId: 1 });
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "図の一覧" })).toHaveStyle({ width: "300px" })
    );
    expect(JSON.parse(localStorage.getItem("lorelei.layout.v1")!)).toEqual({ listWidth: 300, listOpen: true });
    // 閉じるとつまみも消え、閉じたことを覚える
    await user.click(screen.getByRole("button", { name: "図の一覧を開閉" }));
    expect(screen.queryByRole("separator", { name: "図の一覧の幅" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("lorelei.layout.v1")!)).toEqual({ listWidth: 300, listOpen: false });
  });

  it("起動時は覚えた幅と開閉で始める (spec 05 D3)", async () => {
    localStorage.setItem("lorelei.layout.v1", JSON.stringify({ listWidth: 360, listOpen: true }));
    shell();
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "図の一覧" })).toHaveStyle({ width: "360px" })
    );
  });

  it("タイトルバーの ≡ で一覧を開閉する", async () => {
    const { user } = shell();
    await list();
    await user.click(screen.getByRole("button", { name: "図の一覧を開閉" }));
    expect(screen.queryByRole("navigation", { name: "図の一覧" })).toBeNull();
  });
});
