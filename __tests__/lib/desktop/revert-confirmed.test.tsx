import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/__tests__/test-utils";
import { FlowEditor } from "@/features/flowchart/flow-editor";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { clearPendingOpens } from "@/lib/desktop/use-desktop-open";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
/**
 * Rust が出すイベントを、テストから起こす。lib/desktop/tauri の listen / listenPayload を静的に模擬してハンドラを捕まえる。
 * @tauri-apps/api/event の動的 import を vi.mock する形だと、同じテストの途中で模擬が本物に差し替わることがある
 * (direction-save.test.tsx の未処理エラー 14 件と同じ現象。2026-09-28 に観測)。同じイベントに複数の聞き手が居る
 */
const { handlers, subscribe } = vi.hoisted(() => {
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
const banner = () => screen.getByRole("banner");

// spec 32: 確定した中身を残し、● は確定した中身との違い。「確定へ戻す」で戻す
describe("確定へ戻す (spec 32)", { timeout: 30000 }, () => {
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

  it("確定で中身が残り ● が消える。編集で ● が付き、確定へ戻すで戻って ● が消え、Ctrl+Z で編集へ戻る", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();
    await waitFor(() => expect(toolbarButton("確定")).toBeEnabled());
    expect(toolbarButton("確定へ戻す")).toBeDisabled();

    await user.click(toolbarButton("確定"));
    await waitFor(() => expect(backend.docs.get(doc.id)!.confirmed?.source).toContain("A --> B"));
    await waitFor(() => expect(banner()).not.toHaveTextContent("●"));

    await user.click(toolbarButton("ノード追加"));
    await waitFor(() => expect(backend.docs.get(doc.id)!.source).toContain("Node "), {
      timeout: 8000,
    });
    await waitFor(() => expect(banner()).toHaveTextContent("● 注文"));
    await waitFor(() => expect(toolbarButton("確定へ戻す")).toBeEnabled());

    await user.click(toolbarButton("確定へ戻す"));
    await user.click(await screen.findByRole("button", { name: "戻す" }));
    await waitFor(() => expect(count()).toBe(2), { timeout: 8000 });
    await waitFor(() => expect(backend.docs.get(doc.id)!.source).not.toContain("Node "), {
      timeout: 8000,
    });
    expect(backend.docs.get(doc.id)!.layout).toEqual(backend.docs.get(doc.id)!.confirmed!.layout);
    await waitFor(() => expect(banner()).not.toHaveTextContent("●"));

    // 戻す操作も 1 手 (Undo で取り消せる)
    await waitFor(() => expect(toolbarButton("元に戻す")).toBeEnabled());
    await user.click(toolbarButton("元に戻す"));
    await waitFor(() => expect(count()).toBe(3));
  });

  it("開けない図 (準備ができない) は、Ctrl+S でもボタンでも確定しない", async () => {
    // 変換できない図: 初期図が見えたまま「開けないので保存しません」。確定すると初期図を確定した中身にしてしまう
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) =>
      cmd === "convert_source" && String(args.source).includes("壊れた")
        ? ({
            source: String(args.source),
            payload: null,
            dropped: [],
            error: "読めません",
            document: null,
          } as unknown as Awaited<ReturnType<typeof real>>)
        : real(cmd, args)
    );
    const doc = backend.add("flowchart", "壊れた図", {
      origin: "ai",
      source: "flowchart TD\n  壊れた\n",
    });
    backend.setLast(doc.id);
    shell();
    await screen.findByText("この図は開けないので保存しません", {}, { timeout: 8000 });
    expect(toolbarButton("確定")).toBeDisabled();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 1500));
    expect(backend.calls("confirm_document")).toHaveLength(0);
    expect(backend.docs.get(doc.id)!.confirmed ?? null).toBeNull();
  });

  it("走っている自動保存と確定が重なっても、古い版で落ちず、偽の「開き直します」も出ない", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();
    // 保存を遅くして、確定を押す時に自動保存が走っている形を作る
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
      if (cmd === "save_document") await new Promise((r) => setTimeout(r, 600));
      return real(cmd, args);
    });
    await user.click(toolbarButton("ノード追加"));
    const before = backend.calls("save_document").length;
    await waitFor(() => expect(backend.calls("save_document").length).toBeGreaterThan(before), {
      timeout: 4000,
    });
    await user.click(toolbarButton("確定"));

    await waitFor(() => expect(backend.docs.get(doc.id)!.confirmed?.source).toContain("Node "), {
      timeout: 8000,
    });
    expect(screen.queryByText("AI が図を書き換えたので開き直します")).toBeNull();
    expect(screen.queryByText("AI が図を書き換えたので、確定しませんでした")).toBeNull();
    await waitFor(() => expect(banner()).not.toHaveTextContent("●"));
  });

  it("AI が書き換えた (載せ替えが届いていない) 図の確定は古い版で断られ、確定しない", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    await opened();
    backend.update(doc.id, "flowchart TD\n  A --> B\n  B --> C\n");

    await user.click(toolbarButton("確定"));

    await screen.findByText("AI が図を書き換えたので、確定しませんでした", {}, { timeout: 8000 });
    expect(backend.docs.get(doc.id)!.confirmed ?? null).toBeNull();
    expect(backend.docs.get(doc.id)!.source).toContain("B --> C");
  });
});
