import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErEditableEdge } from "../components/edge/er-editable-edge";
import type { ErCardinality } from "../types";

describe("ErEditableEdge", () => {
  const baseProps = {
    id: "edge-1",
    label: "relation",
    cardinality: "one-to-one" as ErCardinality,
    onLabelChange: vi.fn(),
    onCardinalityChange: vi.fn(),
    onDelete: vi.fn(),
  };

  it("ラベルが表示される", () => {
    render(<ErEditableEdge {...baseProps} />);
    expect(screen.getByText("relation")).toBeInTheDocument();
  });

  it("ラベルをクリックで編集できる", () => {
    render(<ErEditableEdge {...baseProps} />);
    fireEvent.click(screen.getByText("relation"));
    const input = screen.getByDisplayValue("relation");
    fireEvent.change(input, { target: { value: "new label" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseProps.onLabelChange).toHaveBeenCalledWith("edge-1", "new label");
  });

  it("カーディナリティ変更時にonCardinalityChangeが呼ばれる", () => {
    render(<ErEditableEdge {...baseProps} />);
    // カーディナリティボタンをラベルで直接取得
    const menuButton = screen.getByRole("button", { name: "1...1" });
    fireEvent.click(menuButton);
    // メニューと目的のアイテムをシンプルに取得（重複しないラベルを選択）
    const menu = screen.getByRole("menu", { hidden: true });
    const menuItem = within(menu).getByText(/1\.\.\.\+/);
    fireEvent.click(menuItem);
    expect(baseProps.onCardinalityChange).toHaveBeenCalled();
  });

  it("削除ボタンでonDeleteが呼ばれる", () => {
    render(<ErEditableEdge {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Delete edge"));
    expect(baseProps.onDelete).toHaveBeenCalledWith("edge-1");
  });
});

// 2026-10-01 spec 16 P2 の tauri dev で見つけた: 同じ ID の線 (edge-N) を持つ別の図を開くと、前の図のラベルが残る
describe("ErEditableEdge — 別の図で使い回された時", () => {
  it("編集していない時は、データのラベルに合わせる", () => {
    const props = {
      id: "edge-1",
      label: "注文する",
      cardinality: "one-to-many" as ErCardinality,
      onLabelChange: vi.fn(),
      onCardinalityChange: vi.fn(),
      onDelete: vi.fn(),
    };
    const { rerender } = render(<ErEditableEdge {...props} />);
    expect(screen.getByText("注文する")).toBeInTheDocument();
    rerender(<ErEditableEdge {...props} label="所属する" />);
    expect(screen.getByText("所属する")).toBeInTheDocument();
    expect(screen.queryByText("注文する")).toBeNull();
  });
});
