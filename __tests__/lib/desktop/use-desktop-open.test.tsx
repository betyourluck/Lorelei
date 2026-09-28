import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@/__tests__/test-utils";
import type { OpenRequest } from "@/lib/desktop/open-requests";
import { queueOpen, setDocsBridge, useDesktopOpen } from "@/lib/desktop/use-desktop-open";

let pendingFromBackend: OpenRequest[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => (cmd === "take_pending_open" ? pendingFromBackend.splice(0) : undefined),
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
    pendingFromBackend = [];
    push.mockClear();
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
    // 橋渡しが立つまで取り込まない (spec 08 P3) ので、外枠の代わりに最小の橋渡しを置く
    mod.setDocsBridge({ beforeImport: () => {}, afterImport: () => {}, beforeLeave: () => {}, currentId: () => null });
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
    setDocsBridge({ beforeImport: () => {}, afterImport: () => {}, beforeLeave: () => {}, currentId: () => null });
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

  // spec 08 D3: update_diagram の載せ替え (reload) は partitionOpens に入れず、今の図の id と一致する時だけ載せ替える
  it("載せ替えの要求は、同じ回に別の図の「開く」が並んでいても先に取り込む", async () => {
    // Claude Code はツールを並列に呼ぶ。最後の 1 件だけ取り込むと載せ替えが捨てられ、古いキャンバスの保存が AI の更新を潰す (査読 2-(4))
    const onImport = vi.fn();
    const calls: string[] = [];
    setDocsBridge({
      beforeImport: (r) => calls.push(`before ${r.document?.id} reload=${Boolean(r.reload)}`),
      afterImport: () => calls.push("after"),
      beforeLeave: () => {},
      currentId: () => "d1",
    });
    const reloadData = { nodes: [{ variableName: "受付" }], edges: [] };
    const otherData = { nodes: [{ variableName: "発送" }], edges: [] };
    queueOpen({ ...request, reload: true, layout: { 受付: { x: 1, y: 2 } }, payload: { editor: "flowchart", data: reloadData, dropped: [] } });
    // queueOpen は 1 件しか預からないので、2 件目は take_pending_open の側に置く
    pendingFromBackend = [
      { ...request, document: { ...request.document!, id: "d2" }, payload: { editor: "flowchart", data: otherData, dropped: [] } },
    ];
    render(<Editor onImport={onImport} />);
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport.mock.calls.map(([d]) => d)).toEqual([reloadData, otherData]);
    expect(calls).toEqual(["before d1 reload=true", "after", "before d2 reload=false", "after"]);
  });

  it("載せ替えの要求は、今の図と id が違えば捨て、今の図が無ければ開くとして扱う", async () => {
    const onImport = vi.fn();
    setDocsBridge({ beforeImport: () => {}, afterImport: () => {}, beforeLeave: () => {}, currentId: () => "other" });
    queueOpen({ ...request, reload: true, layout: {} });
    const first = render(<Editor onImport={onImport} />);
    await new Promise((r) => setTimeout(r, 100));
    expect(onImport).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    first.unmount();

    // 起動直後 (今の図が無い): 前回の last_opened に来た update の載せ替えは、その図を開く
    setDocsBridge({ beforeImport: () => {}, afterImport: () => {}, beforeLeave: () => {}, currentId: () => null });
    queueOpen({ ...request, reload: true, layout: {} });
    render(<Editor onImport={onImport} />);
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
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
      currentId: () => null,
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
