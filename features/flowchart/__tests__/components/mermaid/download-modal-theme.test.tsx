/**
 * spec 24 D5・D6: コード生成のダイアログでテーマを選ぶと、コード・プレビュー・書き出しに効く (編集画面は変えない)
 */
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ERDiagramMermaidModal } from "@/features/er-diagram/components/panel/er-diagram-mermaid-modal";
import { DownloadModal } from "@/features/flowchart/components/mermaid/download-modal";

const flowData = {
  nodes: [
    {
      id: "A",
      type: "editableNode",
      position: { x: 0, y: 0 },
      data: { label: "開始", variableName: "A", shapeType: "rectangle" },
    },
  ],
  edges: [],
};

const previewCode = async () => {
  const preview = screen.getByRole("region", { name: "プレビュー" });
  const svg = await within(preview).findByTestId("mermaid-svg");
  return decodeURIComponent(svg.getAttribute("data-code") ?? "");
};

describe("コード生成のダイアログのテーマ (spec 24)", () => {
  test("テーマを選ぶと、コードの先頭に frontmatter が付き、プレビューの背景が変わる", async () => {
    const { user } = render(<DownloadModal open onClose={vi.fn()} flowData={flowData} />);
    expect((await previewCode()).startsWith("flowchart TD\n")).toBe(true);
    const preview = screen.getByRole("region", { name: "プレビュー" });
    // default は今までどおり (yamada-ui の white)
    expect(getComputedStyle(preview).backgroundColor).not.toBe("rgb(51, 51, 51)");

    await user.click(screen.getByRole("button", { name: "テーマ: default" }));
    await user.click(await screen.findByRole("menuitem", { name: "dark" }));

    await waitFor(async () =>
      expect(
        (await previewCode()).startsWith("---\nconfig:\n  theme: dark\n---\nflowchart TD\n")
      ).toBe(true)
    );
    expect(preview).toHaveStyle({ backgroundColor: "rgb(51, 51, 51)" });
    expect(screen.getByRole("button", { name: "コードをコピーする" })).toBeInTheDocument();
  });

  test("エディタがテーマを持つ時は、それで書き、選び直すとエディタへ知らせる", async () => {
    const onThemeChange = vi.fn();
    const { user } = render(
      <DownloadModal
        open
        onClose={vi.fn()}
        flowData={flowData}
        theme="forest"
        onThemeChange={onThemeChange}
      />
    );
    expect((await previewCode()).startsWith("---\nconfig:\n  theme: forest\n---\n")).toBe(true);

    await user.click(screen.getByRole("button", { name: "テーマ: forest" }));
    await user.click(await screen.findByRole("menuitem", { name: "neutral" }));
    expect(onThemeChange).toHaveBeenCalledWith("neutral");
  });

  test("ER 図のダイアログも、テーマを選ぶとエディタへ知らせ、プレビューの背景を合わせる", async () => {
    const onThemeChange = vi.fn();
    const { user } = render(
      <ERDiagramMermaidModal
        open
        onClose={vi.fn()}
        code={"---\nconfig:\n  theme: dark\n---\nerDiagram\n  A ||--o{ B : x"}
        onDownload={vi.fn()}
        theme="dark"
        onThemeChange={onThemeChange}
      />
    );
    expect(screen.getByRole("region", { name: "プレビュー" })).toHaveStyle({
      backgroundColor: "rgb(51, 51, 51)",
    });

    await user.click(screen.getByRole("button", { name: "テーマ: dark" }));
    await user.click(await screen.findByRole("menuitem", { name: "default" }));
    expect(onThemeChange).toHaveBeenCalledWith("default");
  });
});
