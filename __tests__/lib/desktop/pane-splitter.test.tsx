import "./pointer-event";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/__tests__/test-utils";
import { PaneSplitter } from "@/lib/desktop/pane-splitter";

const splitter = (onDelta = vi.fn(), onReset = vi.fn()) => {
  render(<PaneSplitter label="図の一覧の幅" value={240} min={180} max={480} onDelta={onDelta} onReset={onReset} />);
  return { el: screen.getByRole("separator", { name: "図の一覧の幅" }), onDelta, onReset };
};

describe("つまみ (spec 05 D1)", () => {
  it("縦の区切りとして読み上げられ、今の幅と範囲を持つ", () => {
    const { el } = splitter();
    expect(el).toHaveAttribute("aria-orientation", "vertical");
    expect(el).toHaveAttribute("aria-valuenow", "240");
    expect(el).toHaveAttribute("aria-valuemin", "180");
    expect(el).toHaveAttribute("aria-valuemax", "480");
    expect(el).toHaveAttribute("tabindex", "0");
  });

  it("ドラッグの移動量を差分で渡す (原点をその都度更新する)", () => {
    const { el, onDelta } = splitter();
    fireEvent.pointerDown(el, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 130, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 120, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 200, pointerId: 1 });
    expect(onDelta.mock.calls).toEqual([[30], [-10]]);
  });

  it("押していない時の移動は無視する", () => {
    const { el, onDelta } = splitter();
    fireEvent.pointerMove(el, { clientX: 130, pointerId: 1 });
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("ダブルクリックで既定へ戻す。矢印キーで 16px ずつ", () => {
    const { el, onDelta, onReset } = splitter();
    fireEvent.doubleClick(el);
    expect(onReset).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: "ArrowRight" });
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(onDelta.mock.calls).toEqual([[16], [-16]]);
  });
});
