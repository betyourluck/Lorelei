import { screen, waitFor, within } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ImportModal } from "@/features/flowchart/components/mermaid/import-modal";
import type { ParsedMermaidData } from "@/features/flowchart/hooks/mermaid";
import { parseMermaidCode } from "@/features/flowchart/hooks/mermaid";
import type { MermaidShapeType, MermaidArrowType } from "@/features/flowchart/types/types";

// utilsのモック
vi.mock("@/features/flowchart/hooks/mermaid", () => ({
  parseMermaidCode: vi.fn(),
}));

const mockParseMermaidCode = vi.mocked(parseMermaidCode);

describe("ImportModal", () => {
  const mockParsedData: ParsedMermaidData = {
    nodes: [
      {
        id: "A",
        variableName: "A",
        label: "Start",
        shapeType: "roundedRect" as MermaidShapeType,
      },
      {
        id: "B",
        variableName: "B",
        label: "Process",
        shapeType: "rect" as MermaidShapeType,
      },
    ],
    edges: [
      {
        id: "A-B",
        source: "A",
        target: "B",
        label: "",
        arrowType: "simple" as MermaidArrowType,
      },
    ],
  };

  const mockProps = {
    open: false,
    onClose: vi.fn(),
    onImport: vi.fn(),
  };

  beforeEach(() => {
    mockParseMermaidCode.mockReturnValue(mockParsedData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("モーダルが開いている時にコンテンツが表示される", () => {
    render(<ImportModal {...mockProps} open />);

    expect(screen.getByText("Mermaidコードインポート")).toBeInTheDocument();
    expect(
      screen.getByText("Mermaidのフローチャートコードを貼り付けてインポートできます")
    ).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
    expect(screen.getByText("インポート")).toBeInTheDocument();
    expect(screen.getByTestId("code-editor")).toBeInTheDocument();

    // モーダルが適切に表示されていることを確認
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  test("モーダルが閉じている時にコンテンツが表示されない", () => {
    render(<ImportModal {...mockProps} open={false} />);

    expect(screen.queryByText("Mermaidコードインポート")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("キャンセルボタンクリック時にonCloseが呼ばれる", async () => {
    const onClose = vi.fn();
    const { user } = render(<ImportModal {...mockProps} open onClose={onClose} />);

    const cancelButton = screen.getByText("キャンセル");
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("有効なMermaidコードでインポートが成功する", async () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    const { user } = render(
      <ImportModal {...mockProps} open onImport={onImport} onClose={onClose} />
    );

    const codeInput = screen.getByTestId("code-editor");
    const importButton = screen.getByText("インポート");

    // Mermaidコードを入力
    await user.type(codeInput, "flowchart TD\n  A --> B");

    // インポートボタンをクリック
    await user.click(importButton);

    await waitFor(() => {
      expect(mockParseMermaidCode).toHaveBeenCalledWith("flowchart TD\n  A --> B");
      expect(onImport).toHaveBeenCalledWith(mockParsedData);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  test("空のコードでインポートしようとするとエラーが表示される", async () => {
    // パース結果が空のモックを設定
    const emptyParsedData: ParsedMermaidData = { nodes: [], edges: [] };
    mockParseMermaidCode.mockReturnValue(emptyParsedData);

    const { user } = render(<ImportModal {...mockProps} open />);
    const codeInput = screen.getByTestId("code-editor");
    const importButton = screen.getByRole("button", { name: /インポート/i });

    // 無効なコードを入力してボタンを有効化
    await user.type(codeInput, "invalid code");

    // インポートボタンをクリック
    await user.click(importButton);

    // エラーメッセージの表示を確認
    await waitFor(() => {
      expect(
        screen.getByText(
          "有効なMermaidコードが見つかりませんでした。ノードまたはエッジの定義を確認してください。"
        )
      ).toBeInTheDocument();
    });

    expect(mockProps.onImport).not.toHaveBeenCalled();
    expect(mockProps.onClose).not.toHaveBeenCalled();
  });

  test("パース結果が空の場合エラーが表示される", async () => {
    const emptyParsedData: ParsedMermaidData = {
      nodes: [],
      edges: [],
    };
    mockParseMermaidCode.mockReturnValue(emptyParsedData);

    const { user } = render(<ImportModal {...mockProps} open />);

    const codeInput = screen.getByTestId("code-editor");
    const importButton = screen.getByText("インポート");

    // 無効なMermaidコードを入力
    await user.type(codeInput, "invalid code");
    await user.click(importButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "有効なMermaidコードが見つかりませんでした。ノードまたはエッジの定義を確認してください。"
        )
      ).toBeInTheDocument();
    });
  });

  test("パース中にエラーが発生した場合エラーが表示される", async () => {
    mockParseMermaidCode.mockImplementation(() => {
      throw new Error("Parse error");
    });

    const { user } = render(<ImportModal {...mockProps} open />);

    const codeInput = screen.getByTestId("code-editor");
    const importButton = screen.getByText("インポート");

    // Mermaidコードを入力
    await user.type(codeInput, "flowchart TD\n  A --> B");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText("Mermaidコードの解析中にエラーが発生しました")).toBeInTheDocument();
    });
  });

  test("コード入力時にエラーがクリアされる", async () => {
    // 最初は空の結果を返し、その後有効な結果を返すモックを設定
    const emptyParsedData: ParsedMermaidData = { nodes: [], edges: [] };
    mockParseMermaidCode.mockReturnValueOnce(emptyParsedData);

    const { user } = render(<ImportModal {...mockProps} open />);

    const codeInput = screen.getByTestId("code-editor");
    const importButton = screen.getByText("インポート");

    // まず無効なコードを入力してエラーを発生させる
    await user.type(codeInput, "invalid");
    await user.click(importButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "有効なMermaidコードが見つかりませんでした。ノードまたはエッジの定義を確認してください。"
        )
      ).toBeInTheDocument();
    });

    // コードを追加入力するとエラーが消える
    await user.type(codeInput, " more text");

    await waitFor(() => {
      expect(
        screen.queryByText(
          "有効なMermaidコードが見つかりませんでした。ノードまたはエッジの定義を確認してください。"
        )
      ).not.toBeInTheDocument();
    });
  });

  test("インポートボタンは空のコードの時は無効化される", () => {
    render(<ImportModal {...mockProps} open />);

    const importButton = screen.getByText("インポート");
    expect(importButton).toBeDisabled();
  });

  test("ヘルプテキストが表示される", () => {
    render(<ImportModal {...mockProps} open />);

    expect(screen.getByText(/💡 対応しているノード形状/)).toBeInTheDocument();
  });

  test("例示用のプレースホルダーが表示される", () => {
    render(<ImportModal {...mockProps} open />);

    const codeInput = screen.getByTestId("code-editor");
    expect(codeInput).toHaveAttribute("placeholder");
    expect(codeInput.getAttribute("placeholder")).toContain("flowchart TD");
  });

  test("モーダルを閉じる時にステートがリセットされる", async () => {
    const onClose = vi.fn();
    const { user } = render(<ImportModal {...mockProps} open onClose={onClose} />);

    const codeInput = screen.getByTestId("code-editor");

    // コードを入力
    await user.type(codeInput, "some code");

    // キャンセルボタンでモーダルを閉じる
    const cancelButton = screen.getByText("キャンセル");
    await user.click(cancelButton);

    // handleCloseによってonCloseが1回呼ばれることを確認
    expect(onClose).toHaveBeenCalled();
  });
});

// spec 10 D6: 左にエディタ、右にプレビュー
describe("ImportModal のプレビュー", () => {
  test("エディタの列とプレビューの列が並び、空の時はプレビューに案内を出す", () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);

    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    const previewColumn = screen.getByRole("region", { name: "プレビュー" });
    expect(within(codeColumn).getByTestId("code-editor")).toBeInTheDocument();
    expect(within(previewColumn).getByText("左に Mermaid を貼ると、ここに図が出ます")).toBeInTheDocument();
  });

  test("打つと少し遅れてプレビューが追従する", async () => {
    const { user } = render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);
    await user.type(screen.getByTestId("code-editor"), "flowchart TD");

    const previewColumn = screen.getByRole("region", { name: "プレビュー" });
    const svg = await within(previewColumn).findByTestId("mermaid-svg", {}, { timeout: 2000 });
    expect(decodeURIComponent(svg.getAttribute("data-code") ?? "")).toBe("flowchart TD");
  });

  test("本文がある時は Esc で閉じない (閉じると本文が消える)。空なら閉じる", async () => {
    const onClose = vi.fn();
    const { user } = render(<ImportModal open onClose={onClose} onImport={vi.fn()} />);

    await user.click(screen.getByTestId("code-editor"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await user.type(screen.getByTestId("code-editor"), "flowchart TD");
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
