import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { FlowEditor } from "@/features/flowchart/flow-editor";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { clearPendingOpens } from "@/lib/desktop/use-desktop-open";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, show: async () => {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
// 境界の窓・イベントは静的に模擬する (動的 import の @tauri-apps/api/* が途中で本物になり、空の __TAURI_INTERNALS__ を読んで未処理のエラーを出す, failures #14)
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: async () => () => {},
  listenPayload: async () => () => {},
  onCloseRequested: async () => () => {},
  windowAction: async () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const SOURCE = "flowchart LR\n    A[A]\n    B[B]\n    A --> B\n";

// spec 07 P3 の実機で観測 (2026-09-26): 保存した LR の図を開き、ツールバーで TD に変えても保存されなかった
describe("向きの切り替えの保存 (spec 07 D3)", { timeout: 20000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    // 変換は Rust の to_editor と同じ対応表の TS の取り込み (spec 11 D1) で、Rust の変換と同じ形を返す
    const real = backend.invoke.getMockImplementation()!;
    const toEditor = async (source: string) => {
      const read = await readFlowchartForImport(source);
      if (!read.ok) throw new Error(read.error);
      return read.data;
    };
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) =>
      cmd === "convert_source"
        ? ({
            source: args.source,
            payload: { editor: "flowchart", data: await toEditor(String(args.source)), dropped: [] },
            dropped: [],
            error: null,
            document: null,
          } as unknown as Awaited<ReturnType<typeof real>>)
        : real(cmd, args)
    );
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.clear();
    clearPendingOpens();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("保存した LR の図を開いて TD に変えると、TD で保存する", async () => {
    // 実機の図は位置を持つ (開く時に「位置を当ててから保存」の経路を通る)
    const doc = backend.add("flowchart", "横向き", {
      origin: "ai",
      source: SOURCE,
      layout: { A: { x: 0, y: 0 }, B: { x: 450, y: 0 } },
    });
    backend.setLast(doc.id);
    const { user } = render(
      <ReactFlowProvider>
        <DesktopShell>
          <FlowEditor />
        </DesktopShell>
      </ReactFlowProvider>
    );
    // 開き終えると、エディタの向きが LR になる
    const menus = await screen.findAllByRole("button", { name: "図の向き: LR" }, { timeout: 8000 });
    await user.click(menus[0]);
    await user.click(await screen.findByRole("menuitem", { name: "TD" }));
    await waitFor(
      () =>
        expect(backend.calls("save_document").some((a) => String(a?.source).startsWith("flowchart TD"))).toBe(
          true
        ),
      { timeout: 4000 }
    );
    // 実機で観測 (2026-09-26 23:36): TD で保存された後に「保存」を押すと、LR で書き戻された
    const before = backend.calls("save_document").length;
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(backend.calls("mark_document_saved")).toHaveLength(1));
    const after = backend.calls("save_document").slice(before).map((a) => String(a?.source).split("\n")[0]);
    expect(after.every((line) => line === "flowchart TD"), JSON.stringify(after)).toBe(true);
    expect(backend.docs.get(doc.id)!.source.startsWith("flowchart TD")).toBe(true);
  });
});
