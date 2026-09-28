import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ImportModal } from "@/features/er-diagram/components/mermaid/import-modal";
import { convertMermaidToERData } from "@/features/er-diagram/utils/import-mermaid-to-er";

vi.mock("@/features/er-diagram/utils/import-mermaid-to-er", () => ({
  convertMermaidToERData: vi.fn(),
}));
const mockConvert = vi.mocked(convertMermaidToERData);

// spec 10 D6: ER 図のインポートも左にエディタ、右にプレビュー
describe("ER 図の ImportModal", () => {
  test("エディタの列とプレビューの列が並ぶ", () => {
    render(<ImportModal open onClose={vi.fn()} onImport={vi.fn()} />);

    expect(screen.getByText("Mermaid ER図コードインポート")).toBeInTheDocument();
    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    expect(within(codeColumn).getByTestId("code-editor")).toHaveAttribute("placeholder", expect.stringContaining("erDiagram"));
    expect(screen.getByRole("region", { name: "プレビュー" })).toBeInTheDocument();
  });

  test("打った ER 図を取り込む (取り込みの動きは今どおり)", async () => {
    const parsed = { nodes: [{ id: "顧客" }], edges: [] } as unknown as ReturnType<typeof convertMermaidToERData>;
    mockConvert.mockReturnValue(parsed);
    const onImport = vi.fn();
    const onClose = vi.fn();
    const { user } = render(<ImportModal open onClose={onClose} onImport={onImport} />);

    await user.type(screen.getByTestId("code-editor"), "erDiagram");
    await user.click(screen.getByRole("button", { name: "インポート" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(parsed));
    expect(mockConvert).toHaveBeenCalledWith("erDiagram");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
