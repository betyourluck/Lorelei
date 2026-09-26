import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/__tests__/test-utils";
import { DirectionMenu } from "@/features/flowchart/components/direction-menu";

// spec 07 D1: 図の向きの切り替え (パネルとコード生成のモーダルで共通)
describe("DirectionMenu", () => {
  test("今の向きを出し、選ぶと知らせる", async () => {
    const onChange = vi.fn();
    const { user } = render(<DirectionMenu value="TD" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "図の向き: TD" }));
    await user.click(await screen.findByRole("menuitem", { name: "LR" }));
    expect(onChange).toHaveBeenCalledWith("LR");
  });
});
