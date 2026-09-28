import { insertBracket, startCompletion, completionStatus } from "@codemirror/autocomplete";
import { diagnosticCount, forceLinting, forEachDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CodeEditor } from "@/components/ui/code-editor";
import { parseMermaid } from "@/components/ui/mermaid-render";

// parseMermaid は __tests__/setup.ts で模擬している (既定は「通る」)
const mockParse = vi.mocked(parseMermaid);

/** 描いたエディタの EditorView */
function viewOf(container: HTMLElement): EditorView {
  const dom = container.querySelector(".cm-editor");
  if (!(dom instanceof HTMLElement)) throw new Error("no editor");
  const view = EditorView.findFromDOM(dom);
  if (!view) throw new Error("no view");
  return view;
}

/** 利用者の打鍵として末尾に足す */
function typeAtEnd(view: EditorView, text: string) {
  act(() => {
    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, userEvent: "input.type" });
  });
}

describe("CodeEditor", () => {
  afterEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue(null);
  });

  test("StrictMode の二度走りでもエディタは 1 つ", () => {
    const { container } = render(
      <StrictMode>
        <CodeEditor value="flowchart TD" />
      </StrictMode>
    );
    expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
  });

  test("打鍵で onChange が最新の関数に届く", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(<CodeEditor value="flowchart TD" onChange={first} />);
    rerender(<CodeEditor value="flowchart TD" onChange={second} />);
    typeAtEnd(viewOf(container), "\n  A");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("flowchart TD\n  A");
  });

  test("value を外から変えると中身が替わり、onChange は出さない", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<CodeEditor value="flowchart TD" onChange={onChange} />);
    rerender(<CodeEditor value="flowchart LR" onChange={onChange} />);
    expect(viewOf(container).state.doc.toString()).toBe("flowchart LR");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("読むだけでは打てない", () => {
    const { container } = render(<CodeEditor value="flowchart TD" readOnly />);
    const view = viewOf(container);
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
  });

  test("{ は自動で閉じない (ER の多重度を壊さない)。( と [ は閉じる", () => {
    const { container } = render(<CodeEditor value={"erDiagram\n  顧客 ||--o"} mermaid="er" />);
    const view = viewOf(container);
    // 自動の閉じは後ろが行末・空白の時だけ働くので、カーソルを行末 (多重度を打ちかけの所) に置く
    act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
    expect(insertBracket(view.state, "{")).toBeNull();
    expect(insertBracket(view.state, "(")).not.toBeNull();
    expect(insertBracket(view.state, "[")).not.toBeNull();
  });

  test("検索パネルなどの文言は日本語", () => {
    const { container } = render(<CodeEditor value="" />);
    const state = viewOf(container).state;
    expect(state.phrase("Find")).toBe("検索");
    expect(state.phrase("No diagnostics")).toBe("問題はありません");
  });

  test("CodeMirror が使った Esc (補完を閉じる) は外へ伝わらない。何も開いていない Esc は伝わる", async () => {
    const outer = vi.fn();
    const { container } = render(
      <div onKeyDown={(e) => e.key === "Escape" && outer()}>
        <CodeEditor value={"flowchart TD\n  A --> B\n  B --> "} mermaid="flowchart" intellisense />
      </div>
    );
    const view = viewOf(container);
    act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
    act(() => {
      startCompletion(view);
    });
    await waitFor(() => expect(completionStatus(view.state)).toBe("active"));

    fireEvent.keyDown(view.contentDOM, { key: "Escape" });
    expect(completionStatus(view.state)).toBeNull();
    expect(outer).not.toHaveBeenCalled();

    fireEvent.keyDown(view.contentDOM, { key: "Escape" });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  test("補完の窓は body に出る (ダイアログの枠で切れない)", async () => {
    const { container } = render(
      <CodeEditor value={"flowchart TD\n  A --> B\n  B --> "} mermaid="flowchart" intellisense />
    );
    const view = viewOf(container);
    act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
    act(() => {
      startCompletion(view);
    });
    await waitFor(() => expect(document.querySelector(".cm-tooltip-autocomplete")).not.toBeNull());
    expect(container.contains(document.querySelector(".cm-tooltip-autocomplete"))).toBe(false);
  });

  test("補完は文書の中のノード ID を出す", async () => {
    const { container } = render(
      <CodeEditor value={"flowchart TD\n  開始 --> 判定\n  判定 --> "} mermaid="flowchart" intellisense />
    );
    const view = viewOf(container);
    act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
    act(() => {
      startCompletion(view);
    });
    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll(".cm-completionLabel")).map((e) => e.textContent);
      expect(labels).toEqual(expect.arrayContaining(["開始", "判定"]));
    });
  });

  test("文法の誤りの行に赤線が出る", async () => {
    mockParse.mockResolvedValue({ line: 2, fromColumn: 2, toColumn: 5, message: "Parse error on line 2" });
    const { container } = render(<CodeEditor value={"flowchart TD\n  A --> -->"} mermaid="flowchart" intellisense />);
    const view = viewOf(container);
    act(() => forceLinting(view));
    await waitFor(() => expect(diagnosticCount(view.state)).toBe(1));
    expect(mockParse).toHaveBeenCalledWith("flowchart TD\n  A --> -->", { defaultHeader: undefined });
  });

  test("取り込むと消える行の印を黄色の警告として出す (spec 11 D4)", async () => {
    const { container } = render(
      <CodeEditor
        value={"flowchart TD\n  A --> B\n  style A fill:#f00"}
        mermaid="flowchart"
        intellisense
        warnings={(text) => (text.includes("style") ? [{ line: 3, message: "style 指定は取り込まれません" }] : [])}
      />
    );
    const view = viewOf(container);
    act(() => forceLinting(view));
    await waitFor(() => expect(diagnosticCount(view.state)).toBe(1));
    let found: { severity: string; from: number; message: string } | null = null;
    forEachDiagnostic(view.state, (d, from) => {
      found = { severity: d.severity, from, message: d.message };
    });
    expect(found).toEqual({ severity: "warning", from: view.state.doc.line(3).from, message: "style 指定は取り込まれません" });
  });

  test("intellisense が無ければ検めない", async () => {
    const { container } = render(<CodeEditor value={"flowchart TD\n  A --> -->"} />);
    const view = viewOf(container);
    act(() => forceLinting(view));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockParse).not.toHaveBeenCalled();
  });

  test("フッタは行・列・行数・文字数・挿入/上書きを出し、Insert で切り替わる", () => {
    const { container } = render(<CodeEditor value={"flowchart TD\n  開始"} status />);
    expect(screen.getByText("2 行・17 文字")).toBeInTheDocument();
    expect(screen.getByText("挿入")).toBeInTheDocument();
    fireEvent.keyDown(viewOf(container).contentDOM, { key: "Insert" });
    expect(screen.getByText("上書き")).toBeInTheDocument();
  });

  test("悪意のあるコードは文字として出す (script を作らない)", () => {
    const maliciousCode = '<script>alert("XSS")</script>';
    const { container } = render(<CodeEditor value={maliciousCode} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".cm-content")).toHaveTextContent(maliciousCode);
  });

  test("読むだけならフッタに挿入/上書きを出さない", () => {
    render(<CodeEditor value="flowchart TD" status readOnly />);
    expect(screen.queryByText("挿入")).toBeNull();
  });
});
