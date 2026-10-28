import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { FlowLayout } from "@/components/layout/flow-layout";
import { MINIMAP_KEY } from "@/components/layout/use-minimap-visible";

vi.mock("@/components/ui/contribution-panel", () => ({ ContributionPanel: () => null }));

/** 本物の xyflow の中に置く (Controls の中のボタンとミニマップの出入りを見る) */
const editor = () =>
  render(
    <ReactFlowProvider>
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={[]} edges={[]}>
          <FlowLayout>{null}</FlowLayout>
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );

const minimap = () => document.querySelector(".react-flow__minimap");
const toggle = () => screen.getByRole("button", { name: "ミニマップ" });

describe("ミニマップの出し入れ (spec 26 D4〜D6)", () => {
  // vi.restoreAllMocks() は使わない (setup.ts の ResizeObserver の模擬 (vi.fn) まで消し、xyflow が落ちる)
  afterEach(() => window.localStorage.clear());

  it("既定では出していて、左下の Controls のボタンは押された状態", async () => {
    editor();
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(toggle()).toHaveAttribute("title", "ミニマップを隠す");
    expect(toggle().closest(".react-flow__controls")).not.toBeNull();
    expect(minimap()).not.toBeNull();
  });

  it("押すと隠れ、もう一度押すと出る", async () => {
    const { user } = editor();
    await user.click(toggle());
    expect(minimap()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(toggle()).toHaveAttribute("title", "ミニマップを出す");
    await user.click(toggle());
    expect(minimap()).not.toBeNull();
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("隠したことを覚え、作り直したエディタ (別の種類の図・開き直し) でも隠れたまま始まる", async () => {
    const first = editor();
    await first.user.click(toggle());
    expect(window.localStorage.getItem(MINIMAP_KEY)).toBe("hidden");
    first.unmount();

    editor();
    await waitFor(() => expect(minimap()).toBeNull());
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("出したことも覚える", async () => {
    window.localStorage.setItem(MINIMAP_KEY, "hidden");
    const { user } = editor();
    await waitFor(() => expect(minimap()).toBeNull());
    await user.click(toggle());
    expect(window.localStorage.getItem(MINIMAP_KEY)).toBe("shown");
  });

  it("知らない値は出す", async () => {
    window.localStorage.setItem(MINIMAP_KEY, "maybe");
    editor();
    // マウントの後に読むので、読んだ後も出ていることを待って確かめる
    await waitFor(() => expect(toggle()).toHaveAttribute("aria-pressed", "true"));
    expect(minimap()).not.toBeNull();
  });

  it("localStorage が読めない・書けない環境でも止まらず、切り替えは効く", async () => {
    const spies = [
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      }),
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      }),
    ];
    try {
      const { user } = editor();
      expect(minimap()).not.toBeNull();
      await user.click(toggle());
      expect(minimap()).toBeNull();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
