import { act, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { MermaidPreview } from "@/components/ui/mermaid-preview";
import { renderMermaid } from "@/components/ui/mermaid-render";

// renderMermaid は __tests__/setup.ts で模擬している
const mockRender = vi.mocked(renderMermaid);

/** 外から解決できる Promise */
const deferred = () => {
  let resolve!: (svg: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("MermaidPreview", () => {
  afterEach(() => {
    mockRender.mockClear();
    mockRender.mockImplementation(
      async (id: string, code: string) =>
        `<svg id="${id}" data-testid="mermaid-svg" data-code="${encodeURIComponent(code)}"></svg>`
    );
  });

  test("コードを描いて SVG を差し込む", async () => {
    render(<MermaidPreview code={"flowchart TD\n  A --> B"} />);

    const svg = await screen.findByTestId("mermaid-svg");
    expect(decodeURIComponent(svg.getAttribute("data-code") ?? "")).toBe("flowchart TD\n  A --> B");
    expect(mockRender).toHaveBeenCalledWith(expect.any(String), "flowchart TD\n  A --> B");
  });

  test("描いている間は「描いています…」を出す", async () => {
    const d = deferred();
    mockRender.mockReturnValueOnce(d.promise);
    render(<MermaidPreview code="flowchart TD" />);

    expect(screen.getByText("描いています…")).toBeInTheDocument();
    await act(async () => d.resolve('<svg data-testid="mermaid-svg"></svg>'));
    expect(screen.queryByText("描いています…")).not.toBeInTheDocument();
    expect(screen.getByTestId("mermaid-svg")).toBeInTheDocument();
  });

  test("描けない時はエラーの文を出す", async () => {
    mockRender.mockRejectedValueOnce(
      new Error("Parse error on line 2:\n...A --> --> B\n----^\nExpecting 'NODE_STRING'")
    );
    render(<MermaidPreview code={"flowchart TD\n  A --> --> B"} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("描けませんでした");
    expect(alert).toHaveTextContent("Parse error on line 2:");
    expect(alert).toHaveTextContent("Expecting 'NODE_STRING'");
    expect(screen.queryByTestId("mermaid-svg")).not.toBeInTheDocument();
  });

  test("描くたびに新しい id を使う (英字で始まり、英数とハイフンだけ)", async () => {
    const { rerender } = render(<MermaidPreview code="flowchart TD" />);
    await screen.findByTestId("mermaid-svg");
    rerender(<MermaidPreview code="flowchart LR" />);
    await waitFor(() => expect(mockRender).toHaveBeenCalledTimes(2));

    const [first, second] = mockRender.mock.calls.map(([id]) => id);
    expect(first).not.toBe(second);
    for (const id of [first, second]) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  test("コードが変わった後に届いた古い結果は差し込まない", async () => {
    const old = deferred();
    const fresh = deferred();
    mockRender.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);

    const { rerender } = render(<MermaidPreview code="flowchart TD" />);
    rerender(<MermaidPreview code="flowchart LR" />);
    await act(async () => fresh.resolve('<svg data-testid="mermaid-svg" data-dir="LR"></svg>'));
    await act(async () => old.resolve('<svg data-testid="mermaid-svg" data-dir="TD"></svg>'));

    expect(screen.getByTestId("mermaid-svg")).toHaveAttribute("data-dir", "LR");
  });

  test("コードの文字列が同じなら描き直さない", async () => {
    const { rerender } = render(<MermaidPreview code="flowchart TD" />);
    await screen.findByTestId("mermaid-svg");
    rerender(<MermaidPreview code={["flowchart", "TD"].join(" ")} />);

    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  test("StrictMode の二度走りでも、捨てた方の結果は差し込まない", async () => {
    const first = deferred();
    const second = deferred();
    mockRender.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    render(
      <StrictMode>
        <MermaidPreview code="flowchart TD" />
      </StrictMode>
    );
    await act(async () => second.resolve('<svg data-testid="mermaid-svg" data-run="2"></svg>'));
    await act(async () => first.resolve('<svg data-testid="mermaid-svg" data-run="1"></svg>'));

    expect(screen.getByTestId("mermaid-svg")).toHaveAttribute("data-run", "2");
  });

  test("消えた後に結果が届いても何も起きない", async () => {
    const d = deferred();
    mockRender.mockReturnValueOnce(d.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<MermaidPreview code="flowchart TD" />);
    unmount();
    await act(async () => d.resolve('<svg data-testid="mermaid-svg"></svg>'));

    expect(screen.queryByTestId("mermaid-svg")).not.toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
