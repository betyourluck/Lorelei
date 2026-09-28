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
