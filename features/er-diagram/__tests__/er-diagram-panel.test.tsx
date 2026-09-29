import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node, Edge } from "@xyflow/react";
import { describe, it, expect, vi } from "vitest";
import { render as renderWithUI } from "@/__tests__/test-utils";
import type { ERTableNodeProps } from "../components/node/er-table-node";
import { ERDiagramPanel } from "../components/panel/er-diagram-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/er-diagram",
}));

const dummyNodes: Node<ERTableNodeProps>[] = [];
const dummyEdges: Edge[] = [];
const dummyGenerateCode = () => "erDiagram";
describe("ERDiagramPanel", () => {
  it("renders title and add button", () => {
    render(
      <ERDiagramPanel
        onAddTable={() => {}}
        nodes={dummyNodes}
        edges={dummyEdges}
        generateCode={dummyGenerateCode}
        onImportMermaid={() => {}}
      />
    );
    expect(screen.getByText("Mermaid ER図エディター")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /テーブル追加/ })).toBeInTheDocument();
  });

  it("calls onAddTable when button clicked", async () => {
    const onAddTable = vi.fn();
    render(
      <ERDiagramPanel
        onAddTable={onAddTable}
        nodes={dummyNodes}
        edges={dummyEdges}
        generateCode={dummyGenerateCode}
        onImportMermaid={() => {}}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /テーブル追加/ }));
    expect(onAddTable).toHaveBeenCalled();
  });
});

// spec 13 D2: パネルが今のテーブルから書き出さない列を数え、コード生成のダイアログに渡す (デスクトップのツールバーの「コード生成」も同じダイアログを開く)
describe("ERDiagramPanel の書き出していない列", () => {
  it("コード生成のダイアログに、書き出さない列が出る", async () => {
    const nodes = [
      {
        id: "1",
        type: "erTable",
        position: { x: 0, y: 0 },
        data: {
          name: "ユーザー",
          columns: [
            { name: "id", type: "int", pk: true, uk: false },
            { name: "注文 日", type: "date", pk: false, uk: false },
          ],
          onNameChange: () => {},
          onColumnsChange: () => {},
        },
      },
    ] as Node<ERTableNodeProps>[];
    const { user } = renderWithUI(
      <ERDiagramPanel
        onAddTable={() => {}}
        nodes={nodes}
        edges={[]}
        generateCode={dummyGenerateCode}
        onImportMermaid={() => {}}
      />
    );
    await user.click(screen.getByRole("button", { name: /mermaidコード出力/ }));
    expect(
      await screen.findByText("書き出していない列: ユーザー.注文 日（名前に空白）")
    ).toBeInTheDocument();
  });
});
