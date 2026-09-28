import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@/__tests__/test-utils";
import type { DesktopActions } from "@/lib/desktop/desktop-actions";
import { useDesktopActions } from "@/lib/desktop/desktop-actions";
import { DesktopShell as Shell } from "@/lib/desktop/desktop-shell";
import { fakeBackend } from "./fake-backend";

const DesktopShell = ({ children }: { children: ReactNode }) => (
  <ReactFlowProvider>
    <Shell>{children}</Shell>
  </ReactFlowProvider>
);

const backend = fakeBackend();
const invoke = backend.invoke;
const push = vi.fn();
let pathname = "/";
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
// 境界の窓・イベントは静的に模擬する (動的 import の @tauri-apps/api/* が途中で本物になり、空の __TAURI_INTERNALS__ を読んで未処理のエラーを出す, failures #14)
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: async () => () => {},
  listenPayload: async () => () => {},
  onCloseRequested: async () => () => {},
  windowAction: async () => {},
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => invoke(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const setTauri = (on: boolean) => {
  if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

/** フォーク元のパネルの代わり: 1 行で操作を登録する */
const Panel = (actions: DesktopActions) => {
  useDesktopActions(actions);
  return <div className="react-flow__panel top left">panel</div>;
};

// 起動直後は最初の図が開き終えるまでツールバーを押せない (spec 05 D4)。それを待つテストがあり、全件を並列に回すと 5 秒を超える
describe("ツールバー (spec 02 P2)", { timeout: 15000 }, () => {
  beforeEach(() => {
    invoke.mockClear();
    push.mockClear();
    pathname = "/";
    setTauri(true);
  });
  afterEach(() => setTauri(false));

  it("パネルが登録した「追加」「コード生成」をツールバーから呼べる。ラベルはパネルが決める (D3)", async () => {
    const add = vi.fn();
    const code = vi.fn();
    const { user } = render(
      <DesktopShell>
        <Panel add={{ label: "テーブル追加", run: add }} code={code} />
      </DesktopShell>
    );
    // 最初の図が開き終えるまでは押せない (spec 05 D4: 隠している間は見えない図に足さない)
    await waitFor(() => expect(screen.getByRole("button", { name: "テーブル追加" })).toBeEnabled(), {
      timeout: 5000,
    });
    await user.click(screen.getByRole("button", { name: "テーブル追加" }));
    await user.click(screen.getByRole("button", { name: "コード生成" }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(code).toHaveBeenCalledTimes(1);
  });

  it("エディタが登録した向きをツールバーで切り替える (spec 07 D3)", async () => {
    const setDirection = vi.fn();
    const { user } = render(
      <DesktopShell>
        <Panel add={{ label: "ノード追加", run: vi.fn() }} code={vi.fn()} direction="LR" setDirection={setDirection} />
      </DesktopShell>
    );
    const menu = await screen.findByRole("button", { name: "図の向き: LR" }, { timeout: 5000 });
    await user.click(menu);
    await user.click(await screen.findByRole("menuitem", { name: "RL" }));
    expect(setDirection).toHaveBeenCalledWith("RL");
  });

  it("何も登録されていない間は「追加」「コード生成」を押せない", async () => {
    render(<DesktopShell>x</DesktopShell>);
    expect(await screen.findByRole("button", { name: "コード生成" })).toBeDisabled();
  });

  it("フォーク元の左上・右上のパネルを隠す (D2)", async () => {
    render(
      <DesktopShell>
        <Panel add={{ label: "ノード追加", run: vi.fn() }} code={vi.fn()} />
        <div className="react-flow__panel top right">github</div>
        <div className="react-flow__panel bottom left">controls</div>
      </DesktopShell>
    );
    await screen.findByRole("banner");
    expect(getComputedStyle(screen.getByText("panel")).display).toBe("none");
    expect(getComputedStyle(screen.getByText("github")).display).toBe("none");
    expect(getComputedStyle(screen.getByText("controls")).display).not.toBe("none");
  });

  it("インポートは外枠のダイアログで受け、原文を Rust の変換へ渡す (D10。フォーク元のパーサーは通さない)", async () => {
    const { user } = render(<DesktopShell>x</DesktopShell>);
    await user.click(await screen.findByRole("button", { name: "インポート" }));
    const box = await screen.findByRole("textbox", { name: "Mermaid コード" });
    await user.click(box);
    await user.paste("flowchart LR\n  A --> B");
    await user.click(screen.getByRole("button", { name: "取り込む" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_source", { source: "flowchart LR\n  A --> B" })
    );
  });

  // spec 11 D7: デスクトップのインポートもフォーク元と同じ本文 (大きなダイアログ・エディタ・右のプレビュー・消えるものの要約と印)
  it("インポートのダイアログは左にエディタ、右にプレビューで、取り込むと消えるものを知らせる", async () => {
    const { user } = render(<DesktopShell>x</DesktopShell>);
    await user.click(await screen.findByRole("button", { name: "インポート" }));
    expect(await screen.findByRole("region", { name: "Mermaid コード" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "プレビュー" })).toBeInTheDocument();

    const box = screen.getByRole("textbox", { name: "Mermaid コード" });
    await user.click(box);
    await user.paste('erDiagram\n  顧客 {\n    int id PK "主キー"\n  }');
    const status = await screen.findByRole("status", {}, { timeout: 3000 });
    expect(status).toHaveTextContent("取り込むと消えるもの: 属性のコメント ×1");
    // 1 行目の図の種類で、ER 図の印の規則を使う
    expect(box).toHaveAttribute("data-warnings", "3");
  });

  it("Web 版 (外枠なし) では useDesktopActions は何もしない", () => {
    setTauri(false);
    expect(() =>
      renderHook(() => useDesktopActions({ add: { label: "a", run: vi.fn() }, code: vi.fn() }))
    ).not.toThrow();
  });
});
