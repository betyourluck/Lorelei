import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { render } from "@/__tests__/test-utils";
import { MermaidCodeWithPreview } from "@/components/ui/mermaid-code-with-preview";

describe("MermaidCodeWithPreview", () => {
  test("左にコード、右にプレビューを並べ、コピーのボタンはコードの列にある", async () => {
    render(<MermaidCodeWithPreview code={"flowchart TD\n  A --> B"} />);

    const codeColumn = screen.getByRole("region", { name: "Mermaid コード" });
    const previewColumn = screen.getByRole("region", { name: "プレビュー" });

    expect(within(codeColumn).getByRole("button", { name: "コードをコピーする" })).toBeInTheDocument();
    // Prism は字句ごとに要素を分けるので、列の文字列全体で見る
    expect(codeColumn).toHaveTextContent("A --> B");
    expect(await within(previewColumn).findByTestId("mermaid-svg")).toBeInTheDocument();
    expect(within(previewColumn).queryByRole("button", { name: "コードをコピーする" })).toBeNull();

    // 左 (コード) が先
    expect(codeColumn.compareDocumentPosition(previewColumn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
