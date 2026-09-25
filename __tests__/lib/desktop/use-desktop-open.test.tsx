import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@/__tests__/test-utils";
import type { OpenRequest } from "@/lib/desktop/open-requests";
import { queueOpen, setDocsBridge, useDesktopOpen } from "@/lib/desktop/use-desktop-open";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => (cmd === "take_pending_open" ? [] : undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

  it("別のページ宛ての図を回しただけでは「最初の取り込みが済んだ」にしない (起動時の競合)", async () => {
    // 配布ビルドで観測 (2026-09-25): GUI が起動していない時に ER 図が届くと、フローチャートのページで起動 →
    // ER 図のページへ回した時点で合図が出て、起動処理が「届いた図は無い」と判断して前回の図を開いた。
    // 題名は ER 図・キャンバスは前回のフローチャート、になった
    vi.resetModules();
    const mod = await import("@/lib/desktop/use-desktop-open");
    const settled = () =>
      Promise.race([mod.firstDrain.then(() => true), new Promise((r) => setTimeout(() => r(false), 200))]);
    const er: OpenRequest = { ...request, payload: { ...request.payload!, editor: "erDiagram" } };
    mod.queueOpen(er);
    const At = ({ editor }: { editor: "flowchart" | "erDiagram" }) => {
      mod.useDesktopOpen(editor, vi.fn());
      return null;
    };
    const flow = render(<At editor="flowchart" />);
    expect(await settled()).toBe(false);
    flow.unmount();
    render(<At editor="erDiagram" />);
    expect(await settled()).toBe(true);
  });

  it("図を開き直したら、前に預けた「開く図」は捨てる (spec 04 P0)", async () => {
    // 実機で観測 (2026-09-25): ER 図を押してページが移りきる前にフローの図を押すと、残っていた ER 図の要求が
    // 後から取り込まれ、ページも ER 図へ移り、ER 図のノードがフローの図として保存された
    push.mockClear();
    const onImport = vi.fn();
    const erData = { nodes: [{ name: "部署" }], edges: [] };
    const flowData = { nodes: [{ variableName: "受付" }], edges: [] };
    queueOpen({ ...request, document: null, payload: { editor: "erDiagram", data: erData, dropped: [] } });
    queueOpen({ ...request, document: null, payload: { editor: "flowchart", data: flowData, dropped: [] } });
    render(<Editor onImport={onImport} />);
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledWith(flowData);
    // 捨てた ER 図の要求で、ページを移さない
    expect(push).not.toHaveBeenCalled();
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
