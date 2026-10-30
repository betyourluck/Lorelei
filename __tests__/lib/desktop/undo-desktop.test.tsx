import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/__tests__/test-utils";
import { FlowEditor } from "@/features/flowchart/flow-editor";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { OPEN_EVENT } from "@/lib/desktop/tauri";
import { clearPendingOpens } from "@/lib/desktop/use-desktop-open";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
/**
 * Rust が出すイベントを、テストから起こす。lib/desktop/tauri の listen / listenPayload を静的に模擬してハンドラを捕まえる。
 * @tauri-apps/api/event の動的 import を vi.mock する形だと、同じテストの途中で模擬が本物に差し替わることがある
 * (direction-save.test.tsx の未処理エラー 14 件と同じ現象。2026-09-28 に観測)。同じイベントに複数の聞き手が居る
 */
const { handlers, fire, subscribe } = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;
  const handlers = new Map<string, Set<Handler>>();
  const subscribe = async (event: string, handler: Handler): Promise<() => void> => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    return () => {
      handlers.get(event)?.delete(handler);
    };
  };
  const fire = (event: string, payload: unknown) => {
    handlers.get(event)?.forEach((h) => h(payload));
  };
  return { handlers, fire, subscribe };
});
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: subscribe,
  listenPayload: subscribe,
  // 窓の操作も同じ理由で静的に模擬する (動的 import の @tauri-apps/api/window が途中で本物になり、未処理エラーを出す)
  onCloseRequested: async () => () => {},
  windowAction: async () => {},
  invoke: (cmd: string, args?: Record<string, unknown>) => backend.invoke(cmd, args ?? {}),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, show: async () => {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const SOURCE = "flowchart LR\n    A[A]\n    B[B]\n    A --> B\n";
const LAYOUT = { A: { x: 0, y: 0 }, B: { x: 450, y: 0 } };

/** Rust の convert_source の模擬。変換は Rust の to_editor と同じ対応表の TS の取り込み (spec 11 D1) */
const convert = async (source: string) => {
  const read = await readFlowchartForImport(source);
  if (!read.ok) throw new Error(read.error);
  return {
    source,
    payload: { editor: "flowchart" as const, data: read.data, dropped: [] },
    dropped: [],
    error: null,
  };
};

const shell = () =>
  render(
    <ReactFlowProvider>
      <DesktopShell>
        <FlowEditor />
      </DesktopShell>
    </ReactFlowProvider>
  );

/** 図を開き終え、開いた直後の自動保存 (位置を当てた後の 1 回) が届くまで待つ。届く前に書き換えると、その保存が STALE_BASE になる (それも設計どおりだが、ここで試すことではない) */
const opened = async () => {
  const menus = await screen.findAllByRole("button", { name: /図の向き: / }, { timeout: 8000 });
  await waitFor(() => expect(backend.calls("save_document")).toHaveLength(1), { timeout: 4000 });
  return menus[0];
};

/** mermaid の初回の読み込みは全件を並列に回すと 8 秒を超え、図を開き終える待ちに食い込む。先に 1 度読んでおき、テストの中の変換は解析だけにする (spec 12) */
beforeAll(async () => {
  await readFlowchartForImport("flowchart TD\n  A --> B\n");
}, 60000);

/** ツールバーのボタン (フォーク元のパネルにも同じ名のボタンがあり、デスクトップでは隠している) */
const toolbarButton = (name: string) =>
  screen
    .getAllByRole("button", { name, hidden: true })
    .find((b) => !b.closest(".react-flow__panel"))!;
const count = () => document.querySelectorAll(".react-flow__node").length;
const ctrlZ = () => fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 初期図 (startNode) を保存しようとした */
const savedInitial = () =>
  backend
    .calls("save_document")
    .some((a) => String((a as Record<string, unknown>).source).includes("startNode"));

// spec 30 D3・D4・D5: デスクトップでは、図の準備ができた時を起点にし、図が替わったら・載せ替えで履歴を捨てる
describe("デスクトップの Undo / Redo (spec 30)", { timeout: 30000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) =>
      cmd === "convert_source"
        ? ({ ...(await convert(String(args.source))), document: null } as unknown as Awaited<
            ReturnType<typeof real>
          >)
        : real(cmd, args)
    );
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.clear();
    clearPendingOpens();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    handlers.clear();
  });

  it("開いた直後の Ctrl+Z では図が変わらず、初期図を保存しない", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    shell();
    await opened();
    expect(count()).toBe(2);
    const layout = backend.docs.get(doc.id)!.layout;
    const saves = backend.calls("save_document").length;

    ctrlZ();
    await wait(1500);

    // 図も位置 (開いた時に当てた位置) も変わらず、保存も起きない
    expect(count()).toBe(2);
    expect(backend.docs.get(doc.id)!.layout).toEqual(layout);
    expect(backend.calls("save_document").length).toBe(saves);
    expect(savedInitial()).toBe(false);
    expect(backend.docs.get(doc.id)!.source).toContain("A --> B");
    expect(toolbarButton("元に戻す")).toBeDisabled();
  });

  it("ツールバーの ↶ ↷ で、足したノードを戻し・やり直す", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();

    await user.click(toolbarButton("ノード追加"));
    await waitFor(() => expect(count()).toBe(3));
    await waitFor(() => expect(toolbarButton("元に戻す")).toBeEnabled());

    await user.click(toolbarButton("元に戻す"));
    await waitFor(() => expect(count()).toBe(2));
    await waitFor(() => expect(toolbarButton("やり直す")).toBeEnabled());
    await user.click(toolbarButton("やり直す"));
    await waitFor(() => expect(count()).toBe(3));
  });

  it("AI の載せ替えの後の Ctrl+Z は、載せ替える前へ戻らない", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();
    await user.click(toolbarButton("ノード追加"));
    await waitFor(() => expect(toolbarButton("元に戻す")).toBeEnabled());

    const next = "flowchart LR\n  A --> B --> C\n";
    const summary = backend.update(doc.id, next);
    backend.pending.push({
      ...(await convert(next)),
      document: summary,
      reload: true,
      layout: backend.docs.get(doc.id)!.layout,
    });
    fire(OPEN_EVENT, null);
    await screen.findByText("AI が図を書き換えました", {}, { timeout: 8000 });
    await waitFor(() => expect(count()).toBe(3), { timeout: 8000 });
    await waitFor(() => expect(backend.docs.get(doc.id)!.normalizePending).toBe(false), {
      timeout: 8000,
    });

    ctrlZ();
    await wait(1500);

    expect(screen.getByText("C")).toBeInTheDocument();
    expect(backend.docs.get(doc.id)!.source).toContain("C");
    expect(toolbarButton("元に戻す")).toBeDisabled();
  });

  it("AI が別の図を開いた後の Ctrl+Z で、前の図の中身が出てこない", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();
    await user.click(toolbarButton("ノード追加"));
    await waitFor(() => expect(toolbarButton("元に戻す")).toBeEnabled());

    // Rust の open_in_editor: 新しい図を作り、その図を開く要求を積む
    const other = "flowchart TD\n  X[届いた図]\n";
    const doc2 = backend.add("flowchart", "別の図", { origin: "ai", source: "" });
    backend.pending.push({
      ...(await convert(other)),
      document: backend.summary(doc2),
      reload: false,
      layout: null,
    });
    fire(OPEN_EVENT, null);
    await screen.findByText("届いた図", {}, { timeout: 8000 });
    await waitFor(() => expect(backend.docs.get(doc2.id)!.source).toContain("届いた図"), {
      timeout: 8000,
    });

    ctrlZ();
    await wait(1500);

    expect(count()).toBe(1);
    expect(backend.docs.get(doc2.id)!.source).toContain("届いた図");
    expect(backend.docs.get(doc2.id)!.source).not.toContain("A --> B");
    expect(savedInitial()).toBe(false);
  });
});
