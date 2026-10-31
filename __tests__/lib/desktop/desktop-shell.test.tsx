import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@/__tests__/test-utils";
import { i18n, LOCALE_STORAGE_KEY, LocaleSync } from "@/components/i18n";
import { theme } from "@/components/providers/theme";
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
// 境界の窓・イベントは静的に模擬し、窓の操作は win につなぐ (動的 import の @tauri-apps/api/* が途中で本物になり、
// 空の __TAURI_INTERNALS__ を読んで未処理のエラーを出す, failures #14)
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: async () => () => {},
  listenPayload: async () => () => {},
  onCloseRequested: () => win.onCloseRequested(),
  windowAction: async (action: string) => {
    await (win as unknown as Record<string, (() => unknown) | undefined>)[action]?.();
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const setTauri = (on: boolean) => {
  if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

describe("DesktopShell", () => {
  beforeEach(() => invoke.mockClear());
  afterEach(() => setTauri(false));

  it("窓を出す時には、覚えた言語 (無ければ OS の言語) が当たっている (spec 34 D2: 組み立ての日本語を見せない)", async () => {
    // 覚えた言語は英語。LocaleSync は AppProviders の中で外枠より前の兄弟 (app-providers.tsx)
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    let shownIn: string | null = null;
    win.show.mockImplementationOnce(async () => {
      shownIn = i18n.language;
    });
    setTauri(true);
    render(
      <>
        <LocaleSync />
        <DesktopShell>
          <p>editor</p>
        </DesktopShell>
      </>
    );
    await waitFor(() => expect(shownIn).not.toBeNull());
    expect(shownIn).toBe("en");
    // 外枠の言葉もその言語で描かれている
    expect(screen.getByRole("button", { name: "About Lorelei" })).toBeInTheDocument();
  });

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

  it("覚えた画面の色が dark なら、窓を出す時には body に ui-dark が付いている (spec 27 D7: 明るい画面を見せない)", async () => {
    let darkAtShow: boolean | null = null;
    win.show.mockClear();
    win.show.mockImplementationOnce(async () => {
      darkAtShow = document.body.classList.contains("ui-dark");
    });
    window.localStorage.setItem("ui-color-mode", "dark");
    try {
      setTauri(true);
      render(
        <DesktopShell>
          <p>editor</p>
        </DesktopShell>,
        { providerProps: { theme } }
      );
      await waitFor(() => expect(win.show).toHaveBeenCalledTimes(1));
      expect(darkAtShow).toBe(true);
    } finally {
      window.localStorage.removeItem("ui-color-mode");
      document.body.classList.remove("ui-dark", "ui-light");
    }
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
    // 訳す部品だけを渡す (spec 34 D4)。ライセンスの行は Rust が組み立てる
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("show_about", {
        labels: expect.objectContaining({ title: "Lorelei について", licenses: "ライセンス" }),
      })
    );
  });

  it("AI の図の題のひな形を、最初の描画と言語を切り替えるたびに Rust へ知らせる (spec 34 D5)", async () => {
    setTauri(true);
    render(<DesktopShell>x</DesktopShell>);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_ui_locale", { aiTitle: "AI の図 {time}" }));
    await act(() => i18n.changeLanguage("en"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_ui_locale", { aiTitle: "AI diagram {time}" }));
    expect(backend.calls("set_ui_locale")).toEqual([{ aiTitle: "AI の図 {time}" }, { aiTitle: "AI diagram {time}" }]);
  });
});
