import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@/__tests__/test-utils";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import type { DesktopActions } from "@/lib/desktop/desktop-actions";
import { useDesktopActions } from "@/lib/desktop/desktop-actions";

const invoke = vi.fn();
const push = vi.fn();
let pathname = "/";
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
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

describe("ツールバー (spec 02 P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await user.click(await screen.findByRole("button", { name: "テーブル追加" }));
    await user.click(screen.getByRole("button", { name: "コード生成" }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(code).toHaveBeenCalledTimes(1);
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

  it("種類の切り替えは今の種類を押された状態で出し、別の種類でそのページへ移る (P2 の暫定。D11 は P3)", async () => {
    pathname = "/er-diagram/";
    const { user } = render(<DesktopShell>x</DesktopShell>);
    expect(await screen.findByRole("button", { name: "ER図" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "ER図" }));
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "フローチャート" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("インポートは外枠のダイアログで受け、原文を Rust の変換へ渡す (D10。フォーク元のパーサーは通さない)", async () => {
    const { user } = render(<DesktopShell>x</DesktopShell>);
    await user.click(await screen.findByRole("button", { name: "インポート" }));
    const box = await screen.findByRole("textbox", { name: "Mermaid" });
    await user.click(box);
    await user.paste("flowchart LR\n  A --> B");
    await user.click(screen.getByRole("button", { name: "取り込む" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_source", { source: "flowchart LR\n  A --> B" })
    );
  });

  it("Web 版 (外枠なし) では useDesktopActions は何もしない", () => {
    setTauri(false);
    expect(() =>
      renderHook(() => useDesktopActions({ add: { label: "a", run: vi.fn() }, code: vi.fn() }))
    ).not.toThrow();
  });
});
