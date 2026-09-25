import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { DesktopShell as Shell } from "@/lib/desktop/desktop-shell";
import { fakeBackend } from "./fake-backend";

const DesktopShell = ({ children }: { children: ReactNode }) => (
  <ReactFlowProvider>
    <Shell>{children}</Shell>
  </ReactFlowProvider>
);

const win = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  show: vi.fn(async () => {}),
  onCloseRequested: vi.fn(async () => () => {}),
};
const backend = fakeBackend();
const invoke = backend.invoke;
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => invoke(...a),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const setTauri = (on: boolean) => {
  if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

describe("DesktopShell", () => {
  beforeEach(() => invoke.mockClear());
  afterEach(() => setTauri(false));

  it("Web 版では children をそのまま返し、外枠を出さない (spec 02 D1)", () => {
    setTauri(false);
    const { container } = render(
      <DesktopShell>
        <p>editor</p>
      </DesktopShell>
    );
    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(container.querySelector("[data-lorelei-desktop]")).toBeNull();
  });

  it("外枠が描けたら窓を出す。Web 版では何もしない (spec 05 D5: 窓は隠したまま起動する)", async () => {
    win.show.mockClear();
    setTauri(false);
    const web = render(
      <DesktopShell>
        <p>editor</p>
      </DesktopShell>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(win.show).not.toHaveBeenCalled();
    web.unmount();

    setTauri(true);
    render(
      <DesktopShell>
        <p>editor</p>
      </DesktopShell>
    );
    await screen.findByRole("banner");
    await waitFor(() => expect(win.show).toHaveBeenCalledTimes(1));
  });

  it("デスクトップ版ではタイトルバーの下に children を出し、エディタの高さを 100% にする (D1・D4)", async () => {
    setTauri(true);
    render(
      <DesktopShell>
        <p>editor</p>
      </DesktopShell>
    );
    const bar = await screen.findByRole("banner");
    expect(bar).toHaveAttribute("data-tauri-drag-region");
    expect(bar).toHaveTextContent("Lorelei");
    const content = screen.getByText("editor").parentElement!;
    expect(content.style.getPropertyValue("--lorelei-editor-h")).toBe("100%");
  });

  it("ウィンドウのボタンは drag region にせず、押すと Tauri のウィンドウ操作を呼ぶ", async () => {
    setTauri(true);
    const { user } = render(<DesktopShell>x</DesktopShell>);
    for (const [label, fn] of [
      ["最小化", win.minimize],
      ["最大化", win.toggleMaximize],
      ["閉じる", win.close],
    ] as const) {
      const button = await screen.findByRole("button", { name: label });
      expect(button).not.toHaveAttribute("data-tauri-drag-region");
      await user.click(button);
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    }
  });

  it("? で About を開く (D5: ネイティブのメニューの代わり)", async () => {
    setTauri(true);
    const { user } = render(<DesktopShell>x</DesktopShell>);
    await user.click(await screen.findByRole("button", { name: "Lorelei について" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("show_about", undefined));
  });
});
