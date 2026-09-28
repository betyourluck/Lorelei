import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ImportModal } from "@/features/er-diagram/components/mermaid/import-modal";

// 取り込みは mermaid.js の解析 (spec 11)。__tests__/setup.ts の境界の模擬は readMermaidDiagram だけ本物を返す

const setCode = (code: string) => fireEvent.change(screen.getByTestId("code-editor"), { target: { value: code } });

// spec 10 D6: ER 図のインポートも左にエディタ、右にプレビュー
describe("ER 図の ImportModal", () => {
  test("エディタの列とプレビューの列が並ぶ", () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);

    expect(screen.getByText("Mermaid ER図コードインポート")).toBeInTheDocument();
    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    expect(within(codeColumn).getByTestId("code-editor")).toHaveAttribute("placeholder", expect.stringContaining("erDiagram"));
    expect(screen.getByRole("region", { name: "プレビュー" })).toBeInTheDocument();
  });

  test("日本語の列名も含めて取り込む (spec 11: フォーク元のパーサーは日本語の列名を捨てていた)", async () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    const { user } = render(<ImportModal open onClose={onClose} onImport={onImport} />);

    setCode("erDiagram\n  顧客 {\n    int id PK\n    string 名前\n  }\n  顧客 ||--o{ 注文 : 行う");
    await user.click(screen.getByRole("button", { name: "インポート" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const data = onImport.mock.calls[0][0];
    expect(data.nodes[0].columns.map((c: { name: string }) => c.name)).toEqual(["id", "名前"]);
    expect(data.edges[0]).toMatchObject({ source: "顧客", target: "注文", data: { label: "行う", cardinality: "one-to-many" } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("フローチャートは取り込まない", async () => {
    const onImport = vi.fn();
    const { user } = render(<ImportModal open onClose={vi.fn()} onImport={onImport} />);
    setCode("flowchart TD\n  A --> B");
    await user.click(screen.getByRole("button", { name: "インポート" }));

    expect(await screen.findByText(/ER 図ではありません/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });

  test("取り込むと消えるものを要約で知らせ、行に印を付ける (spec 11 D4)", async () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);
    setCode('erDiagram\n  顧客 {\n    int id PK "主キー"\n  }\n  顧客 }|--|{ 注文 : 行う');

    const status = await screen.findByRole("status", {}, { timeout: 3000 });
    expect(status).toHaveTextContent("取り込むと消えるもの: 属性のコメント ×1、未対応のカーディナリティ ×1");
    expect(screen.getByTestId("code-editor")).toHaveAttribute("data-warnings", "3,5");
  });
});
