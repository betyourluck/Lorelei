import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ImportModal } from "@/features/flowchart/components/mermaid/import-modal";

// 取り込みは mermaid.js の解析 (spec 11)。__tests__/setup.ts の境界の模擬は readMermaidDiagram だけ本物を返すので、本物の取り込みで確かめる

/** エディタ (テストでは textarea に模擬) に本文を入れる。user.type は [ や { を特別な打鍵として読むので、値をまとめて入れる */
const setCode = (code: string) => fireEvent.change(screen.getByTestId("code-editor"), { target: { value: code } });

describe("ImportModal", () => {
  const props = () => ({ open: true, onClose: vi.fn(), onImport: vi.fn() });

  test("モーダルが開いている時にコンテンツが表示される", () => {
    render(<ImportModal {...props()} />);

    expect(screen.getByText("Mermaidコードインポート")).toBeInTheDocument();
    expect(screen.getByText("Mermaidのフローチャートコードを貼り付けてインポートできます")).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
    expect(screen.getByText("インポート")).toBeInTheDocument();
    expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  test("モーダルが閉じている時にコンテンツが表示されない", () => {
    render(<ImportModal {...props()} open={false} />);

    expect(screen.queryByText("Mermaidコードインポート")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("キャンセルボタンクリック時にonCloseが呼ばれる", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    await user.click(screen.getByText("キャンセル"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  test("有効なMermaidコードでインポートが成功する", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("flowchart TD\n  A[開始] --> B{判定}");
    await user.click(screen.getByText("インポート"));

    await waitFor(() => expect(p.onImport).toHaveBeenCalledTimes(1));
    const data = p.onImport.mock.calls[0][0];
    expect(data.nodes.map((n: { id: string; shapeType: string }) => [n.id, n.shapeType])).toEqual([
      ["A", "rectangle"],
      ["B", "diamond"],
    ]);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  test("ノードが 1 つも無い時はエラーが表示される", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("flowchart TD");
    await user.click(screen.getByText("インポート"));

    expect(await screen.findByText(/有効なMermaidコードが見つかりませんでした/)).toBeInTheDocument();
    expect(p.onImport).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  test("文法の誤りは取り込まずに、誤りの行を示す (spec 11 D3)", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("flowchart TD\n  A --> B\n  B --> --> C");
    await user.click(screen.getByText("インポート"));

    expect(await screen.findByText(/Mermaid の文法の誤りで取り込めません（3 行目）/)).toBeInTheDocument();
    expect(p.onImport).not.toHaveBeenCalled();
  });

  test("ER 図は取り込まない", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("erDiagram\n  A ||--o{ B : r");
    await user.click(screen.getByText("インポート"));

    expect(await screen.findByText(/フローチャートではありません/)).toBeInTheDocument();
    expect(p.onImport).not.toHaveBeenCalled();
  });

  test("見出しの無いコードも今どおり取り込める (spec 11 D2)", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("A --> B");
    await user.click(screen.getByText("インポート"));

    await waitFor(() => expect(p.onImport).toHaveBeenCalledTimes(1));
  });

  test("コード入力時にエラーがクリアされる", async () => {
    const { user } = render(<ImportModal {...props()} />);
    setCode("flowchart TD");
    await user.click(screen.getByText("インポート"));
    expect(await screen.findByText(/有効なMermaidコードが見つかりませんでした/)).toBeInTheDocument();

    setCode("flowchart TD\n  A --> B");
    expect(screen.queryByText(/有効なMermaidコードが見つかりませんでした/)).not.toBeInTheDocument();
  });

  test("インポートボタンは空のコードの時は無効化される", () => {
    render(<ImportModal {...props()} />);
    expect(screen.getByText("インポート")).toBeDisabled();
  });

  test("ヘルプテキストが表示される", () => {
    render(<ImportModal {...props()} />);
    expect(screen.getByText(/💡 対応しているノード形状/)).toBeInTheDocument();
  });

  test("例示用のプレースホルダーが表示される", () => {
    render(<ImportModal {...props()} />);
    expect(screen.getByTestId("code-editor").getAttribute("placeholder")).toContain("flowchart TD");
  });

  test("モーダルを閉じる時にステートがリセットされる", async () => {
    const p = props();
    const { user } = render(<ImportModal {...p} />);
    setCode("some code");
    await user.click(screen.getByText("キャンセル"));
    expect(p.onClose).toHaveBeenCalled();
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

// spec 11 D4: 取り込むと消えるものの警告
describe("ImportModal の警告", () => {
  test("取り込むと消えるものを、取り込む前に要約で知らせる", async () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);
    setCode("flowchart TD\n  subgraph S\n    A --> B\n  end\n  style A fill:#f00");

    const status = await screen.findByRole("status", {}, { timeout: 3000 });
    // 並びは名前の順 (style < subgraph。MCP の通知と同じ)
    expect(status).toHaveTextContent("取り込むと消えるもの: style 指定 ×1、サブグラフ ×1");
  });

  test("消える書き方の行に印を付ける", () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);
    setCode("flowchart TD\n  subgraph S\n    A --> B\n  end\n  style A fill:#f00");
    expect(screen.getByTestId("code-editor")).toHaveAttribute("data-warnings", "2,5");
  });
});
