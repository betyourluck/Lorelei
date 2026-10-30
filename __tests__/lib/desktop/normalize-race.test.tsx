import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
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

// spec 33: AI の書き換え (update_diagram) の直後の人の編集が、揃え書きとして updated_at を進めずに書かれてはいけない
describe("揃え書きと人の編集 (spec 33)", { timeout: 30000 }, () => {
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

  it("載せ替えの直後に人がノードを足すと、その保存は updated_at を進める (AI の古い版では書き換えられない)", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();

    // AI の update_diagram: Store::update → 載せ替えの要求 → OPEN_EVENT
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
    await screen.findByText("C", {}, { timeout: 8000 });
    // 準備ができた (ツールバーが押せる) すぐ後に、人がノードを足す
    await waitFor(() => expect(toolbarButton("ノード追加")).toBeEnabled(), { timeout: 8000 });
    await user.click(toolbarButton("ノード追加"));

    // 足したノードがファイルに届くまで待つ
    await waitFor(() => expect(backend.docs.get(doc.id)!.source).toContain("Node "), {
      timeout: 8000,
    });
    const after = backend.docs.get(doc.id)!;
    expect(after.normalizePending).toBe(false);
    // 人の編集は AI の版 (summary.updatedAt) のままではいけない
    expect(after.updatedAt).not.toBe(summary.updatedAt);
    // 揃え書き (印付き) は AI の中身だけ: 人の足したノードを含まない
    const marked = (backend.calls("save_document") as Record<string, unknown>[]).filter(
      (a) => a.normalize === true
    );
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((a) => !String(a.source).includes("Node "))).toBe(true);
  });

  it("印の無い保存は、揃え書きの印が立っていても updated_at を進めて印を消す (偽のバックエンドの規則 = Rust と同じ)", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    const summary = backend.update(doc.id, "flowchart LR\n  A --> B --> C\n");
    await backend.invoke("save_document", {
      id: doc.id,
      source: "flowchart LR\n  A --> B --> C --> D\n",
      layout: {},
      baseUpdatedAt: summary.updatedAt,
      normalize: false,
    });
    const after = backend.docs.get(doc.id)!;
    expect(after.normalizePending).toBe(false);
    expect(after.updatedAt).not.toBe(summary.updatedAt);
  });
});
