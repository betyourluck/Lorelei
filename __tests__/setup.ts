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

// ダイアログが読むエディタ (遅延の包み) の模擬 (spec 10 P3)。CodeMirror と next/dynamic を通さず、textarea で打てるようにする。
// CodeEditor 自身のテストは @/components/ui/code-editor を直接読むので本物を使う
vi.mock("@/components/ui/lazy-code-editor", async () => {
  const { createElement } = await import("react");
  return {
    LazyCodeEditor: (props: {
      value: string;
      onChange?: (value: string) => void;
      placeholder?: string;
      readOnly?: boolean;
      "aria-label"?: string;
      warnings?: (text: string) => { line: number; message: string }[];
    }) =>
      createElement("textarea", {
        "data-testid": "code-editor",
        value: props.value,
        placeholder: props.placeholder,
        readOnly: props.readOnly,
        "aria-label": props["aria-label"],
        // 取り込むと消える行の印 (spec 11 D4) をテストから見えるようにする
        "data-warnings": props.warnings ? props.warnings(props.value).map((w) => w.line).join(",") : undefined,
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      }),
  };
});

// jsdom に DOMMatrixReadOnly は無い。xyflow はノードの寸法を測る時にビューポートの transform から拡大率 (m22) だけを読む
// (@xyflow/system の updateNodeInternals)。無いと未処理のエラーになるので、transform の matrix(...) から読む最小の形を置く
if (typeof window !== "undefined" && !("DOMMatrixReadOnly" in window)) {
  class DOMMatrixReadOnlyStub {
    m22 = 1;
    constructor(transform?: string) {
      const m = /matrix\(([^)]+)\)/.exec(transform ?? "");
      if (m) this.m22 = Number(m[1].split(",")[3]) || 1;
    }
  }
  Object.defineProperty(window, "DOMMatrixReadOnly", { writable: true, value: DOMMatrixReadOnlyStub });
}

// jsdom の Range は寸法を持たない。CodeMirror が文字の位置を測る時 (rAF の中) に落ちないよう最小の形を置く (spec 10)
if (typeof Range !== "undefined") {
  const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= emptyRects;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
}

// mermaid の描画のモック。jsdom では本物の mermaid が描けない (SVG の寸法が測れない)。
// 動的 import した mermaid を模擬するのではなく、境界のモジュールを静的に模擬する
vi.mock("@/components/ui/mermaid-render", async () => {
  // 取り込みの解析 (spec 11) は本物を使う (jsdom でも mermaid の解析は動く。描画だけが動かない)
  const actual = await vi.importActual<typeof import("@/components/ui/mermaid-render")>("@/components/ui/mermaid-render");
  return {
    renderMermaid: vi.fn(
      async (id: string, code: string) =>
        `<svg id="${id}" data-testid="mermaid-svg" data-code="${encodeURIComponent(code)}"></svg>`
    ),
    // 文法の検め (spec 10 D5)。既定は「通る」
    parseMermaid: vi.fn(async () => null),
    readMermaidDiagram: actual.readMermaidDiagram,
  };
});
