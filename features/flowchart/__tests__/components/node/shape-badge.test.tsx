/**
 * ノードの右上の形の札 (spec 29、data_contract NodeShapeBadge) の決めごと。
 * - 6 つの形で絵が違い、形を変えると変わる。名は札のボタンの aria-label と title
 * - 押すと形のメニュー (押した時だけ差し込み、リストは文書の直下)。選ぶと onShapeChange
 * - 押す・ダブルクリックしても、ノードのドラッグ・ラベルの編集を始めない
 * - 左上の変数名の札ははみ出す名を省略し、全文を title に出す
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "@/__tests__/test-utils";
import { NodeContent } from "@/features/flowchart/components/node/editable-node";
import { ShapeBadge } from "@/features/flowchart/components/node/shape-badge";
import type { MermaidShapeType } from "@/features/flowchart/types/types";
import { SHAPE_OPTIONS, shapeLabel } from "@/features/flowchart/types/types";

const shapes = SHAPE_OPTIONS.map((s) => s.type as MermaidShapeType);
const nameOf = (shape: MermaidShapeType) => shapeLabel(shape);

const nodeProps = (shapeType: MermaidShapeType) => ({
  data: {
    label: "ラベル",
    variableName: "node1",
    shapeType,
    onLabelChange: vi.fn(),
    onVariableNameChange: vi.fn(),
    onShapeTypeChange: vi.fn(),
    onDelete: vi.fn(),
  },
  id: "1",
});

const badgeOf = (shape: MermaidShapeType) =>
  screen.getByRole("button", { name: `形: ${nameOf(shape)}` });

describe("ノードの形の札 (spec 29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("6 つの形で、札の名と絵がそれぞれ違う", () => {
    const drawn = new Set<string>();
    for (const shape of shapes) {
      const { unmount } = render(<NodeContent {...nodeProps(shape)} />);
      const badge = badgeOf(shape);
      expect(badge).toHaveAttribute("title", `形: ${nameOf(shape)}`);
      const svg = badge.querySelector("svg");
      expect(svg).toHaveAttribute("data-shape", shape);
      expect(svg).toHaveAttribute("aria-hidden", "true");
      drawn.add(svg!.innerHTML);
      unmount();
    }
    expect(drawn.size).toBe(shapes.length);
  });

  test("形を変えると札も変わる", () => {
    const { rerender } = render(<NodeContent {...nodeProps("rectangle")} />);
    expect(badgeOf("rectangle").querySelector("svg")).toHaveAttribute("data-shape", "rectangle");

    rerender(<NodeContent {...nodeProps("diamond")} />);

    expect(badgeOf("diamond").querySelector("svg")).toHaveAttribute("data-shape", "diamond");
  });

  test("形を持たないノードは四角形の札", () => {
    const props = nodeProps("rectangle");
    render(<NodeContent {...props} data={{ ...props.data, shapeType: undefined }} />);

    expect(badgeOf("rectangle")).toBeInTheDocument();
  });

  test("札はノードの外枠の最後の子で、押してもノードのドラッグを始めない (nodrag)", () => {
    render(<NodeContent {...nodeProps("circle")} />);
    const badge = badgeOf("circle");

    expect(badge).toHaveClass("nodrag");
    // 外枠 = ⋮⋮ のボタンと札の両方を持つ一番近い要素。札はその最後の子 (見た目の台本の道筋をずらさない, spec 29 受け入れ条件 5)
    let box: HTMLElement | null = screen.getByLabelText("ノードの操作メニューを開く").parentElement;
    while (box && !box.contains(badge)) box = box.parentElement;
    expect(box?.lastElementChild).toBe(badge);
  });

  test("札をダブルクリックしても、ラベルの編集を始めない", () => {
    render(<NodeContent {...nodeProps("hexagon")} />);

    fireEvent.doubleClick(badgeOf("hexagon"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  describe("札のメニュー", () => {
    // 閉じた yamada-ui の Menu も項目の文字を DOM に持つので、開いたかは role で見る (failures #22)
    test("閉じている時はメニューを描かない", () => {
      render(<ShapeBadge shape="rectangle" onShapeChange={vi.fn()} />);

      for (const shape of shapes) expect(document.body.textContent).not.toContain(nameOf(shape));
      expect(badgeOf("rectangle")).toHaveAttribute("aria-expanded", "false");
    });

    test("押すと 6 つの形のメニューが文書の直下に開き、選ぶと形を知らせて閉じる", async () => {
      const user = userEvent.setup();
      const onShapeChange = vi.fn();
      const { container } = render(<ShapeBadge shape="rectangle" onShapeChange={onShapeChange} />);

      await user.click(badgeOf("rectangle"));

      const menu = await screen.findByRole("menu");
      await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(shapes.length));
      expect(container.contains(menu)).toBe(false);
      await waitFor(() => expect(badgeOf("rectangle")).toHaveAttribute("aria-expanded", "true"));

      await user.click(screen.getByRole("menuitem", { name: /菱形/ }));

      expect(onShapeChange).toHaveBeenCalledWith("diamond");
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    test("キー (Enter) でも開き、最初の項目にフォーカスが移る", async () => {
      const user = userEvent.setup();
      render(<ShapeBadge shape="stadium" onShapeChange={vi.fn()} />);

      badgeOf("stadium").focus();
      await user.keyboard("{Enter}");

      await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(shapes.length));
      await waitFor(() => expect(screen.getAllByRole("menuitem")[0]).toHaveFocus());
    });
  });

  describe("左上の変数名の札", () => {
    test("はみ出す名は省略し、全文を title に出す", () => {
      const props = nodeProps("diamond");
      const long = "aVeryLongVariableNameThatWouldRunIntoTheShapeBadge";
      render(<NodeContent {...props} data={{ ...props.data, variableName: long }} />);

      const tag = screen.getByText(`{${long}}`);
      expect(tag).toHaveAttribute("title", `{${long}}`);
      expect(tag).toHaveStyle({
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
    });
  });
});
