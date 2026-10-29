import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { theme } from "@/components/providers/theme";
import { ColorModeMenu } from "@/lib/desktop/color-mode-menu";
import { TitleBar } from "@/lib/desktop/title-bar";

const KEY = "ui-color-mode";
const button = () => screen.getByRole("button", { name: /^画面の色:/ });

/** OS の色 (prefers-color-scheme) を差し替える。setup.ts の模擬は常に light */
const osDark = (dark: boolean) => {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return () => (window.matchMedia = original);
};

// spec 27 D1・D2: デスクトップのタイトルバーで画面の色を選ぶ (ライト・ダーク・OS に合わせる、既定はライト)
describe("画面の色の切り替え (spec 27 D1・D2)", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.body.classList.remove("ui-dark", "ui-light");
  });

  it("既定はライトで、ボタンは今の色を名乗る", async () => {
    render(<ColorModeMenu />, { providerProps: { theme } });
    await waitFor(() => expect(button()).toHaveAccessibleName("画面の色: ライト"));
    expect(document.body).not.toHaveClass("ui-dark");
  });

  it("「ダーク」を選ぶと暗くなり、ui-color-mode に覚える", async () => {
    const { user } = render(<ColorModeMenu />, { providerProps: { theme } });
    await user.click(button());
    await user.click(await screen.findByRole("menuitem", { name: "ダーク" }));
    await waitFor(() => expect(document.body).toHaveClass("ui-dark"));
    expect(window.localStorage.getItem(KEY)).toBe("dark");
    expect(button()).toHaveAccessibleName("画面の色: ダーク");
  });

  it("覚えた色で始まる", async () => {
    window.localStorage.setItem(KEY, "dark");
    render(<ColorModeMenu />, { providerProps: { theme } });
    await waitFor(() => expect(button()).toHaveAccessibleName("画面の色: ダーク"));
    expect(document.body).toHaveClass("ui-dark");
  });

  it("「OS に合わせる」は system を覚え、OS が暗ければ暗くなる", async () => {
    const restore = osDark(true);
    try {
      const { user } = render(<ColorModeMenu />, { providerProps: { theme } });
      await user.click(button());
      await user.click(await screen.findByRole("menuitem", { name: "OS に合わせる" }));
      await waitFor(() => expect(window.localStorage.getItem(KEY)).toBe("system"));
      expect(document.body).toHaveClass("ui-dark");
      expect(button()).toHaveAccessibleName("画面の色: OS に合わせる");
    } finally {
      restore();
    }
  });

  it("ライトに戻すと明るくなる", async () => {
    window.localStorage.setItem(KEY, "dark");
    const { user } = render(<ColorModeMenu />, { providerProps: { theme } });
    await user.click(button());
    await user.click(await screen.findByRole("menuitem", { name: "ライト" }));
    await waitFor(() => expect(document.body).not.toHaveClass("ui-dark"));
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("タイトルバーの「Lorelei について」の左に置く", () => {
    render(<TitleBar title="図" />, { providerProps: { theme } });
    const buttons = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    const at = buttons.findIndex((l) => l?.startsWith("画面の色:"));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(buttons[at + 1]).toBe("Lorelei について");
  });
});
