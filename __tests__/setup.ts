import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// matchMediaのモック
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserverのモック
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// IntersectionObserverのモック
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// mermaid の描画のモック。jsdom では本物の mermaid が描けない (SVG の寸法が測れない)。
// 動的 import した mermaid を模擬するのではなく、境界のモジュールを静的に模擬する
vi.mock("@/components/ui/mermaid-render", () => ({
  renderMermaid: vi.fn(
    async (id: string, code: string) =>
      `<svg id="${id}" data-testid="mermaid-svg" data-code="${encodeURIComponent(code)}"></svg>`
  ),
}));
