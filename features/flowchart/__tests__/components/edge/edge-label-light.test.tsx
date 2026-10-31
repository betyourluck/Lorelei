/**
 * 線のラベルを軽くした形 (spec 23) の決めごと。
 * - 閉じたラベルは矢印の種類のメニューを描かない (押した時だけ差し込む)
 * - メニューの開き方・閉じ方・フォーカスの行き先は、差し込む前 (いつも描いていた頃) と同じ
 * - 外枠は枠の面の上でも押せる (pointer-events・zIndex, failures #25)、メニューは文書の直下に出る (failures #28)
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ArrowTypeSelector } from "@/features/flowchart/components/edge/arrow-type-selector";
import { EdgeContent } from "@/features/flowchart/components/edge/editable-edge";
import { getArrowTypeDisplayName } from "@/features/flowchart/hooks/mermaid";
import { ARROW_TYPES } from "@/features/flowchart/types/types";

const itemNames = ARROW_TYPES.map((t) => getArrowTypeDisplayName(t));

describe("線のラベルを軽くした形 (spec 23)", () => {
  const data = {
    label: "ラベル",
    arrowType: "arrow" as const,
    onLabelChange: vi.fn(),
    onArrowTypeChange: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("閉じている時", () => {
    // 閉じたメニューの項目は role="menuitem" を持たない (yamada-ui は閉じた項目を menuitemradio で描く) ので、role では見ない (failures #22)
    test("閉じたラベルは、矢印の種類のメニューの項目を DOM に描かない", () => {
      render(<EdgeContent id="e1" labelX={0} labelY={0} data={data} />);

      for (const name of itemNames) expect(document.body.textContent).not.toContain(name);
      expect(screen.getByRole("button", { name: "矢印の種類を選ぶ" })).toBeInTheDocument();
    });

    test("閉じた矢印の種類の切り替えは、メニューの項目を DOM に描かない", () => {
      render(<ArrowTypeSelector currentArrowType="arrow" onArrowTypeChange={vi.fn()} />);

      for (const name of itemNames) expect(document.body.textContent).not.toContain(name);
    });

    test("外枠は枠の面の上でも押せる (pointer-events: all、渡した zIndex)", () => {
      render(<EdgeContent id="e1" labelX={0} labelY={0} data={data} zIndex={5} />);

      const wrap = screen.getByRole("button", { name: "線を削除" }).closest(".nodrag");
      expect(wrap).toHaveClass("nopan");
      expect(wrap).toHaveStyle({ pointerEvents: "all", zIndex: "5" });
    });
  });

  test("開いたメニューは、ラベルの外 (文書の直下) に出る", async () => {
    const user = userEvent.setup();
    render(<EdgeContent id="e1" labelX={0} labelY={0} data={data} zIndex={5} />);
    const wrap = screen.getByRole("button", { name: "線を削除" }).closest(".nodrag");

    await user.click(screen.getByRole("button", { name: "矢印の種類を選ぶ" }));

    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(ARROW_TYPES.length));
    expect(wrap?.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  // 開き方・閉じ方・フォーカスの行き先が、いつもメニューを描いていた頃 (spec 23 の前) と同じであること。
  // 前の形でも通る (spec 23 P1 で確かめた)
  test("メニューの 7 つの手順で、開き方・項目・フォーカスの行き先が変わらない", async () => {
    const user = userEvent.setup();
    const onArrowTypeChange = vi.fn();
    render(
      <div>
        <button>外のボタン</button>
        <EdgeContent id="e1" labelX={0} labelY={0} data={{ ...data, onArrowTypeChange }} />
      </div>
    );
    const arrow = () => screen.getByRole("button", { name: "矢印の種類を選ぶ" });
    const items = () => screen.queryAllByRole("menuitem");
    const opened = () => waitFor(() => expect(items()).toHaveLength(ARROW_TYPES.length));
    const closed = () => waitFor(() => expect(items()).toHaveLength(0));

    // 1. Enter で開くと、最初の項目にフォーカスが行く
    arrow().focus();
    await user.keyboard("{Enter}");
    await opened();
    await waitFor(() => expect(document.activeElement).toHaveTextContent(itemNames[0]));
    expect(document.activeElement).toHaveAttribute("role", "menuitem");

    // 2. ↓ で次の項目へ
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveTextContent(itemNames[1]);

    // 3. Esc で閉じ、フォーカスは矢印のボタンへ戻る
    await user.keyboard("{Escape}");
    await closed();
    await waitFor(() => expect(arrow()).toHaveFocus());

    // 4. クリックで開くと、フォーカスはメニューの中へ移る
    await user.click(arrow());
    await opened();
    await waitFor(() => expect(arrow()).not.toHaveFocus());

    // 5. Esc で閉じ、フォーカスは矢印のボタンへ戻る
    await user.keyboard("{Escape}");
    await closed();
    await waitFor(() => expect(arrow()).toHaveFocus());

    // 6. 開いて外を押すと閉じ、フォーカスは押した先に残る
    await user.click(arrow());
    await opened();
    await user.click(screen.getByText("外のボタン"));
    await closed();
    expect(screen.getByText("外のボタン")).toHaveFocus();

    // 7. 項目を選ぶと矢印の種類が変わって閉じ、フォーカスは矢印のボタンへ戻る
    await user.click(arrow());
    await opened();
    await user.click(screen.getByText(itemNames[1]));
    expect(onArrowTypeChange).toHaveBeenCalledWith("e1", ARROW_TYPES[1]);
    await closed();
    await waitFor(() => expect(arrow()).toHaveFocus());
  });
});
