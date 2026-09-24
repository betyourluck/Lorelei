import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@/__tests__/test-utils";
import type { OpenRequest } from "@/lib/desktop/open-requests";
import { queueOpen, setDocsBridge, useDesktopOpen } from "@/lib/desktop/use-desktop-open";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => (cmd === "take_pending_open" ? [] : undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const request: OpenRequest = {
  source: "flowchart LR\n  受付 --> 発送",
  payload: { editor: "flowchart", data: { nodes: [], edges: [] }, dropped: [] },
  dropped: [],
  error: null,
  document: {
    id: "d1",
    title: "AI の図",
    editor: "flowchart",
    origin: "ai",
    createdAt: "t",
    updatedAt: "t",
    savedAt: null,
    unsaved: false,
  },
};

const Editor = ({ onImport }: { onImport: (d: unknown) => void }) => {
  useDesktopOpen("flowchart", onImport);
  return null;
};

describe("useDesktopOpen と図の一覧の橋渡し (spec 02 P3)", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    setDocsBridge(null);
  });

  it("開発モード (StrictMode: effect が 2 回走る) でも、届いた図を取り込む", async () => {
    // 実機で観測 (2026-09-24): ER 図のページで AI のフローチャートを受けると、ページは移るが図が載らず保存もされなかった
    const onImport = vi.fn();
    const calls: string[] = [];
    setDocsBridge({
      beforeImport: () => {
        calls.push("before");
      },
      afterImport: () => {
        calls.push("after");
      },
      beforeLeave: () => {},
    });
    queueOpen(request);
    render(
      <StrictMode>
        <Editor onImport={onImport} />
      </StrictMode>
    );
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["before", "after"]);
  });
});
