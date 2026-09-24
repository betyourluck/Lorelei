import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/__tests__/test-utils";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const shell = () =>
  render(
    <ReactFlowProvider>
      <DesktopShell>editor</DesktopShell>
    </ReactFlowProvider>
  );

const openSettings = async (user: ReturnType<typeof shell>["user"]) => {
  await user.click(await screen.findByRole("button", { name: /MCP/ }));
  return within(await screen.findByRole("dialog"));
};

describe("MCP の設定画面 (spec 03 D4・D6)", { timeout: 15000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("タイトルバーに待ち受けの状態を出し、押すと設定画面が開く (D6)", async () => {
    const { user } = shell();
    const mark = await screen.findByRole("button", { name: "MCP: 待ち受け中 127.0.0.1:39642" });
    await user.click(mark);
    expect(await screen.findByRole("dialog")).toHaveTextContent("MCP サーバー");
  });

  it("状態・ポート・伏せたトークンを出す。トークンの本文は画面に出さない", async () => {
    const { user } = shell();
    const dlg = await openSettings(user);
    expect(dlg.getByText("待ち受け中: 127.0.0.1:39642")).toBeInTheDocument();
    expect(dlg.getByRole("spinbutton", { name: "ポート" })).toHaveValue(39642);
    expect(dlg.getByText(/127\.0\.0\.1 のみ/)).toBeInTheDocument();
    expect(screen.queryByText(/0123456789abcdef0123456789abcdef/)).toBeNull();
  });

  it("登録コマンドをコピーできる。トークンとポートが入り、local スコープ (リポジトリに入らない) (D4)", async () => {
    const { user } = shell();
    const dlg = await openSettings(user);
    await user.click(dlg.getByRole("button", { name: "登録コマンドをコピー" }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toBe(
      'claude mcp add --transport http lorelei http://127.0.0.1:39642/mcp --header "Authorization: Bearer 0123456789abcdef0123456789abcdef"'
    );
    expect(dlg.getByText(/プロジェクトのフォルダで実行/)).toBeInTheDocument();
  });

  it("有効を切ると待ち受けを止める", async () => {
    const { user } = shell();
    const dlg = await openSettings(user);
    await user.click(dlg.getByRole("checkbox", { name: "MCP サーバーを有効にする" }));
    await waitFor(() => expect(backend.calls("set_mcp_enabled")).toEqual([{ enabled: false }]));
    expect(await dlg.findByText("止めています")).toBeInTheDocument();
  });

  it("トークンの作り直しは確かめてから行う", async () => {
    const { user } = shell();
    const dlg = await openSettings(user);
    await user.click(dlg.getByRole("button", { name: "トークンを作り直す" }));
    expect(backend.calls("regenerate_mcp_token")).toEqual([]);
    expect(dlg.getByText(/つながらなくなります/)).toBeInTheDocument();
    await user.click(dlg.getByRole("button", { name: "作り直す" }));
    await waitFor(() => expect(backend.calls("regenerate_mcp_token")).toHaveLength(1));
  });

  it("ポートを変えて適用する", async () => {
    const { user } = shell();
    const dlg = await openSettings(user);
    const port = dlg.getByRole("spinbutton", { name: "ポート" });
    await user.clear(port);
    await user.type(port, "40000");
    await user.click(dlg.getByRole("button", { name: "ポートを適用" }));
    await waitFor(() => expect(backend.calls("set_mcp_port")).toEqual([{ port: 40000 }]));
  });

  it("待ち受けに失敗したら理由を出す", async () => {
    backend.mcp.state = "failed";
    backend.mcp.detail = "127.0.0.1:39642 で待ち受けられません (使用中)";
    const { user } = shell();
    expect(await screen.findByRole("button", { name: /MCP: 待ち受けられません/ })).toBeInTheDocument();
    const dlg = await openSettings(user);
    expect(dlg.getByText(/使用中/)).toBeInTheDocument();
  });
});
