import { screen, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@/__tests__/test-utils";
import { renderMermaid } from "@/components/ui/mermaid-render";
import { DownloadModal } from "@/features/flowchart/components/mermaid/download-modal";
import type { FlowData } from "@/features/flowchart/hooks/flow-helpers";
import { generateMermaidCode } from "@/features/flowchart/hooks/mermaid";

// グローバルオブジェクトの設定
Object.defineProperty(global, "URL", {
  value: {
    createObjectURL: vi.fn(),
    revokeObjectURL: vi.fn(),
  },
  writable: true,
});

// utilsのモック
vi.mock("@/features/flowchart/hooks/mermaid", () => ({
  generateMermaidCode: vi.fn(),
}));

const mockGenerateMermaidCode = vi.mocked(generateMermaidCode);

// CopyButtonのモック
vi.mock("@/components/ui/copy-button", () => ({
  CopyButton: ({ value, ...props }: { value: string } & HTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="copy-button" data-value={value} {...props}>
      コピー
    </button>
  ),
}));

describe("DownloadModal", () => {
  const mockFlowData: FlowData = {
    nodes: [
      {
        id: "1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Node A" },
      },
      {
        id: "2",
        type: "default",
        position: { x: 100, y: 100 },
        data: { label: "Node B" },
      },
    ],
    edges: [
      {
        id: "e1-2",
        source: "1",
        target: "2",
        data: {},
      },
    ],
  };

  const mockProps = {
    open: false, // デフォルトは閉じている状態
    onClose: vi.fn(),
    flowData: mockFlowData,
  };

  beforeEach(() => {
    mockGenerateMermaidCode.mockReturnValue("flowchart TD\n  A --> B");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("モーダルが開いている時にコンテンツが表示される", () => {
    render(<DownloadModal {...mockProps} open />);

    expect(screen.getByText("生成されたMermaidコード")).toBeInTheDocument();
    expect(screen.getByText("ダウンロード")).toBeInTheDocument();
    expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();

    // モーダルが適切に表示されていることを確認
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  test("モーダルが閉じている時にコンテンツが表示されない", () => {
    render(<DownloadModal {...mockProps} open={false} />);

    expect(screen.queryByText("生成されたMermaidコード")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("閉じるボタンがクリックされた時にonCloseが呼ばれる", async () => {
    const onClose = vi.fn();
    const { user } = render(<DownloadModal {...mockProps} open onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close modal/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("左のエディタに正しいコードが読むだけで渡される (spec 10 D7)", () => {
    render(<DownloadModal {...mockProps} open />);

    const editor = screen.getByTestId("code-editor");
    expect(editor).toHaveValue("flowchart TD\n  A --> B");
    expect(editor).toHaveAttribute("readonly");
  });

  test("コピーボタンに正しいMermaidコードが渡される", () => {
    render(<DownloadModal {...mockProps} open />);

    const copyButton = screen.getByTestId("copy-button");
    expect(copyButton).toHaveAttribute("data-value", "flowchart TD\n  A --> B");
  });

  test("generateMermaidCodeが適切なパラメータで呼ばれる", () => {
    render(<DownloadModal {...mockProps} open />);

    // 初期レンダリング時にTDで呼ばれる
    expect(mockGenerateMermaidCode).toHaveBeenCalledWith(mockFlowData, "TD");
  });

  test("空のflowDataでもエラーが発生しない", () => {
    const emptyFlowData: FlowData = {
      nodes: [],
      edges: [],
    };

    expect(() => {
      render(<DownloadModal {...mockProps} flowData={emptyFlowData} open />);
    }).not.toThrow();

    expect(screen.getByText("生成されたMermaidコード")).toBeInTheDocument();
  });
});

// spec 09: 左にコード、右にプレビュー
describe("DownloadModal のプレビュー", () => {
  const mockRender = vi.mocked(renderMermaid);

  afterEach(() => {
    mockRender.mockClear();
    // 後ろの describe は上の beforeEach の戻り値に頼っているので、それに戻す
    mockGenerateMermaidCode.mockReset();
    mockGenerateMermaidCode.mockReturnValue("flowchart TD\n  A --> B");
  });

  test("コードの列とプレビューの列が並び、プレビューに生成したコードが渡る", async () => {
    mockGenerateMermaidCode.mockReturnValue("flowchart TD\n  A --> B");
    render(<DownloadModal open onClose={vi.fn()} flowData={{ nodes: [], edges: [] }} />);

    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    const previewColumn = screen.getByRole("region", { name: "プレビュー" });
    expect(within(codeColumn).getByTestId("copy-button")).toBeInTheDocument();
    expect(within(codeColumn).getByTestId("code-editor")).toBeInTheDocument();
    const svg = await within(previewColumn).findByTestId("mermaid-svg");
    expect(decodeURIComponent(svg.getAttribute("data-code") ?? "")).toBe("flowchart TD\n  A --> B");
  });

  test("向きを変えるとプレビューに新しいコードが渡る", async () => {
    mockGenerateMermaidCode.mockImplementation((_data, direction) => `flowchart ${direction}`);
    const { user } = render(
      <DownloadModal open onClose={vi.fn()} flowData={{ nodes: [], edges: [] }} />
    );
    await waitFor(() => expect(mockRender).toHaveBeenLastCalledWith(expect.any(String), "flowchart TD"));

    await user.click(screen.getByRole("button", { name: "図の向き: TD" }));
    await user.click(await screen.findByRole("menuitem", { name: "LR" }));

    await waitFor(() => expect(mockRender).toHaveBeenLastCalledWith(expect.any(String), "flowchart LR"));
  });
});

// spec 07 D1: モーダルの向きはエディタの向き (ただ 1 つの持ち主) を読み書きする
describe("DownloadModal の向き", () => {
  test("渡された向きで書き、選び直すとエディタへ知らせる", async () => {
    const onDirectionChange = vi.fn();
    const { user } = render(
      <DownloadModal
        open
        onClose={vi.fn()}
        flowData={{ nodes: [], edges: [] }}
        direction="LR"
        onDirectionChange={onDirectionChange}
      />
    );
    expect(mockGenerateMermaidCode).toHaveBeenCalledWith({ nodes: [], edges: [] }, "LR");
    await user.click(screen.getByRole("button", { name: "図の向き: LR" }));
    await user.click(await screen.findByRole("menuitem", { name: "RL" }));
    expect(onDirectionChange).toHaveBeenCalledWith("RL");
  });
});
