import { screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ERDiagramMermaidModal } from "@/features/er-diagram/components/panel/er-diagram-mermaid-modal";

// spec 09: 左にコード、右にプレビュー
describe("ERDiagramMermaidModal", () => {
  const code = "erDiagram\n  顧客 ||--o{ 注文 : places";

  test("コードの列とプレビューの列が並び、プレビューにコードが渡る", async () => {
    render(<ERDiagramMermaidModal open onClose={vi.fn()} code={code} onDownload={vi.fn()} />);

    expect(screen.getByText("生成されたMermaidコード")).toBeInTheDocument();
    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    const previewColumn = screen.getByRole("region", { name: "プレビュー" });
    expect(within(codeColumn).getByRole("button", { name: "コードをコピーする" })).toBeInTheDocument();
    const svg = await within(previewColumn).findByTestId("mermaid-svg");
    expect(decodeURIComponent(svg.getAttribute("data-code") ?? "")).toBe(code);
  });

  test("「ダウンロード」は今どおり onDownload を呼ぶ", async () => {
    const onDownload = vi.fn();
    const { user } = render(
      <ERDiagramMermaidModal open onClose={vi.fn()} code={code} onDownload={onDownload} />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});

// spec 13 D2: Mermaid に書けないので書き出さなかった列を知らせる
describe("ERDiagramMermaidModal の書き出していない列", () => {
  const code = "erDiagram\n  注文 {\n  }";

  test("書き出さなかった列を「テーブル名.列名（理由）」で並べる", () => {
    render(
      <ERDiagramMermaidModal
        open
        onClose={vi.fn()}
        code={code}
        onDownload={vi.fn()}
        skippedColumns={[
          { table: "注文", column: "注文 日", reason: "名前に空白" },
          { table: "注文", column: "", reason: "名前と型が空" },
        ]}
      />
    );
    expect(
      screen.getByText("書き出していない列: 注文.注文 日（名前に空白）、注文.（名前と型が空）")
    ).toBeInTheDocument();
  });

  test("無ければ出さない", () => {
    render(
      <ERDiagramMermaidModal
        open
        onClose={vi.fn()}
        code={code}
        onDownload={vi.fn()}
        skippedColumns={[]}
      />
    );
    expect(screen.queryByText(/書き出していない列/)).toBeNull();
  });
});
